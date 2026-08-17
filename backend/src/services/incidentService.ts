import type { Incident, IncidentStatus, IncidentType, MonitorCheck } from '@prisma/client'
import prisma from '../utils/prisma'
import { AppError } from '../utils/errors'
import { classifySeverity } from './schemaService'
import type { SchemaChange } from './schemaService'
import { sendIncidentEmail } from './emailService'

const OPEN_STATUSES: IncidentStatus[] = ['OPEN', 'ACKNOWLEDGED']

function findOpenIncident(apiId: string, type: IncidentType) {
  return prisma.incident.findFirst({ where: { apiId, type, status: { in: OPEN_STATUSES } } })
}

// Fires once per newly-opened CRITICAL incident (outage, or a breaking schema
// change). Notification failures are logged, not thrown — a broken mail
// config must never stop an incident from being recorded.
async function notifyIfCritical(incident: Incident): Promise<void> {
  if (incident.severity !== 'CRITICAL') return

  const apiMonitor = await prisma.apiMonitor.findUnique({
    where: { id: incident.apiId },
    include: { user: true },
  })
  if (!apiMonitor) return

  try {
    await sendIncidentEmail({ to: apiMonitor.user.email, apiMonitor, incident })
  } catch (err) {
    console.error('[incidentService] failed to send incident email:', err)
  }
}

function describeFailure(check: MonitorCheck): string {
  if (check.errorType) {
    return `The endpoint failed with ${check.errorType.replace(/_/g, ' ').toLowerCase()}.`
  }
  if (check.httpStatus !== null) {
    return `The endpoint responded with unexpected status ${check.httpStatus}.`
  }
  return 'The endpoint failed to respond as expected.'
}

// Opens one CRITICAL outage incident on failure and leaves it open across
// repeated failures; resolves it automatically once the endpoint recovers.
export async function handleOutageIncident(apiId: string, check: MonitorCheck): Promise<void> {
  const existing = await findOpenIncident(apiId, 'OUTAGE')

  if (!check.success) {
    if (existing) return
    const incident = await prisma.incident.create({
      data: {
        apiId,
        type: 'OUTAGE',
        severity: 'CRITICAL',
        title: 'API is unreachable or failing',
        description: describeFailure(check),
      },
    })
    await notifyIfCritical(incident)
    return
  }

  if (existing) {
    await prisma.incident.update({
      where: { id: existing.id },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    })
  }
}

function summarizeTitle(changes: SchemaChange[]): string {
  const removed = changes.filter((c) => c.type === 'removed').length
  const structural = changes.filter((c) => c.type === 'structural_change').length
  const typeChanged = changes.filter((c) => c.type === 'type_changed').length

  if (removed > 0) return `Breaking change detected — ${removed} field(s) removed`
  if (structural > 0) return `Breaking change detected — ${structural} field(s) restructured`
  if (typeChanged > 0) return `Schema change detected — type change in ${typeChanged} field(s)`
  return 'Schema change detected'
}

function summarizeChanges(changes: SchemaChange[]): string[] {
  return changes.map((c) => {
    switch (c.type) {
      case 'added':
        return `Field added: ${c.path} (${c.newType})`
      case 'removed':
        return `Field removed: ${c.path} (was ${c.oldType})`
      case 'structural_change':
        return `Structural change: ${c.path} (${c.oldType} → ${c.newType})`
      case 'type_changed':
        return `Type changed: ${c.path} (${c.oldType} → ${c.newType})`
    }
  })
}

// Only WARNING/CRITICAL diffs page anyone — pure additions don't.
// Never opens a second incident while one is already open for this monitor.
export async function handleSchemaChangeIncident(
  apiId: string,
  changes: SchemaChange[],
): Promise<void> {
  const severity = classifySeverity(changes)
  if (severity === 'INFO') return

  const existing = await findOpenIncident(apiId, 'SCHEMA_CHANGE')
  if (existing) return

  const incident = await prisma.incident.create({
    data: {
      apiId,
      type: 'SCHEMA_CHANGE',
      severity,
      title: summarizeTitle(changes),
      description: summarizeChanges(changes).join('\n'),
    },
  })
  await notifyIfCritical(incident)
}

async function getOwnedIncident(userId: string, id: string): Promise<Incident> {
  const incident = await prisma.incident.findFirst({ where: { id, apiMonitor: { userId } } })
  if (!incident) {
    throw new AppError(404, 'NOT_FOUND', 'Incident not found')
  }
  return incident
}

export async function listIncidents(
  userId: string,
  filters: { apiId?: string; status?: IncidentStatus },
): Promise<Incident[]> {
  return prisma.incident.findMany({
    where: {
      apiMonitor: { userId },
      ...(filters.apiId && { apiId: filters.apiId }),
      ...(filters.status && { status: filters.status }),
    },
    orderBy: { openedAt: 'desc' },
  })
}

export async function getIncident(userId: string, id: string): Promise<Incident> {
  return getOwnedIncident(userId, id)
}

export async function acknowledgeIncident(userId: string, id: string): Promise<Incident> {
  const incident = await getOwnedIncident(userId, id)
  if (incident.status !== 'OPEN') {
    throw new AppError(400, 'INVALID_TRANSITION', 'Only an open incident can be acknowledged')
  }
  return prisma.incident.update({ where: { id }, data: { status: 'ACKNOWLEDGED' } })
}

export async function resolveIncident(userId: string, id: string): Promise<Incident> {
  const incident = await getOwnedIncident(userId, id)
  if (incident.status === 'RESOLVED') {
    throw new AppError(400, 'INVALID_TRANSITION', 'Incident is already resolved')
  }
  return prisma.incident.update({
    where: { id },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  })
}
