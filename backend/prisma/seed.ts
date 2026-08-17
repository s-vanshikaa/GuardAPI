import bcrypt from 'bcrypt'
import type { Prisma } from '@prisma/client'
import prisma from '../src/utils/prisma'
import { extractSchema, hashSchema, diffSchemas, classifySeverity } from '../src/services/schemaService'

const DEMO_PASSWORD = 'demo12345'
const SALT_ROUNDS = 10

const HOUR = 60 * 60 * 1000
const MIN = 60 * 1000

// Every check/snapshot/incident below is computed relative to this single
// instant, so re-running the seed always reproduces the same story (down to
// exact timestamps) rather than drifting a little further "into the past"
// on every run.
const NOW = Date.now()

interface CheckSpec {
  checkedAt: Date
  success: boolean
  httpStatus: number | null
  latencyMs: number | null
  errorType: string | null
}

// Evenly spaced checks going backward from `now`, oldest first.
function checkSeries(
  apiId: string,
  count: number,
  intervalMs: number,
  make: (indexFromNow: number) => Omit<CheckSpec, 'checkedAt'>,
) {
  return Array.from({ length: count }, (_, i) => {
    const indexFromNow = count - 1 - i // 0 = most recent
    return {
      apiId,
      checkedAt: new Date(NOW - indexFromNow * intervalMs),
      ...make(indexFromNow),
    }
  })
}

function jitter(base: number, spread: number): number {
  return Math.round(base + (Math.random() - 0.5) * 2 * spread)
}

async function resetDemoRows(apiId: string) {
  await prisma.incident.deleteMany({ where: { apiId } })
  await prisma.schemaSnapshot.deleteMany({ where: { apiId } })
  await prisma.monitorCheck.deleteMany({ where: { apiId } })
}

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS)
  const user = await prisma.user.upsert({
    where: { email: 'demo@guardapi.dev' },
    update: { passwordHash },
    create: { email: 'demo@guardapi.dev', passwordHash },
  })

  // Superseded by the five scenarios below — drop it and its history if a
  // pre-Ticket-18 seed run left it behind.
  const stale = await prisma.apiMonitor.findUnique({ where: { id: 'seed-example-monitor' } })
  if (stale) {
    await resetDemoRows(stale.id)
    await prisma.apiMonitor.delete({ where: { id: stale.id } })
  }

  // ---- 1. Healthy: GitHub's API is real, public, and reliably fast — the
  // live scheduler keeps polling it, so this scenario stays "healthy" on its
  // own rather than needing a frozen fake state. ----
  const healthy = await prisma.apiMonitor.upsert({
    where: { id: 'seed-healthy-api' },
    update: {},
    create: {
      id: 'seed-healthy-api',
      userId: user.id,
      name: 'GitHub API',
      endpointUrl: 'https://api.github.com',
      description: 'Public GitHub REST API root — used here as a reliable healthy example.',
      expectedStatus: 200,
      pollIntervalMinutes: 5,
      isActive: true,
    },
  })
  await resetDemoRows(healthy.id)
  await prisma.monitorCheck.createMany({
    data: checkSeries(healthy.id, 40, 15 * MIN, () => ({
      success: true,
      httpStatus: 200,
      latencyMs: jitter(140, 60),
      errorType: null,
    })),
  })

  // ---- 2. Slow: httpstat.us's sleep param returns 200 after a real delay —
  // consistently slow without needing to fake anything. ----
  const slow = await prisma.apiMonitor.upsert({
    where: { id: 'seed-slow-api' },
    update: {},
    create: {
      id: 'seed-slow-api',
      userId: user.id,
      name: 'Search Service',
      endpointUrl: 'https://httpstat.us/200?sleep=3000',
      description: 'Elasticsearch-backed search — currently under heavier load than usual.',
      expectedStatus: 200,
      pollIntervalMinutes: 5,
      isActive: true,
    },
  })
  await resetDemoRows(slow.id)
  await prisma.monitorCheck.createMany({
    data: checkSeries(slow.id, 40, 15 * MIN, () => ({
      success: true,
      httpStatus: 200,
      latencyMs: jitter(3100, 300),
      errorType: null,
    })),
  })

  // ---- 3. Outage: .invalid is IANA-reserved to never resolve (RFC 2606),
  // so this is a permanent, deterministic DNS failure — was healthy until
  // 3 hours ago, then started failing and hasn't recovered. ----
  const outage = await prisma.apiMonitor.upsert({
    where: { id: 'seed-outage-api' },
    update: {},
    create: {
      id: 'seed-outage-api',
      userId: user.id,
      name: 'Notifications Service',
      endpointUrl: 'https://api.does-not-exist-guardapi-demo.invalid/health',
      description: 'Push/email notification dispatcher.',
      expectedStatus: 200,
      pollIntervalMinutes: 5,
      isActive: true,
    },
  })
  await resetDemoRows(outage.id)
  const outageStartedAgo = 3 * HOUR
  await prisma.monitorCheck.createMany({
    data: [
      ...checkSeries(outage.id, 28, 15 * MIN, (indexFromNow) =>
        indexFromNow * 15 * MIN >= outageStartedAgo
          ? { success: true, httpStatus: 200, latencyMs: jitter(120, 40), errorType: null }
          : { success: false, httpStatus: null, latencyMs: jitter(25, 10), errorType: 'DNS_ERROR' },
      ),
    ],
  })
  await prisma.incident.create({
    data: {
      apiId: outage.id,
      type: 'OUTAGE',
      severity: 'CRITICAL',
      status: 'OPEN',
      title: 'API is unreachable or failing',
      description: 'The endpoint failed with dns error.',
      openedAt: new Date(NOW - outageStartedAgo),
    },
  })

  // ---- 4. Field removed (CRITICAL, acknowledged): a breaking schema
  // change caught a day ago; the team has seen it but not fixed it. ----
  const removed = await prisma.apiMonitor.upsert({
    where: { id: 'seed-schema-removed-api' },
    update: {},
    create: {
      id: 'seed-schema-removed-api',
      userId: user.id,
      name: 'User Profile Service',
      endpointUrl: 'https://internal-api.acme-corp.example/users/profile',
      description: 'Returns the current user profile payload.',
      expectedStatus: 200,
      pollIntervalMinutes: 10,
      // No live source reproduces this exact diff on repoll, so this stays
      // paused — the seeded history is the whole story for this monitor.
      isActive: false,
    },
  })
  await resetDemoRows(removed.id)
  await prisma.monitorCheck.createMany({
    data: checkSeries(removed.id, 30, HOUR, () => ({
      success: true,
      httpStatus: 200,
      latencyMs: jitter(150, 50),
      errorType: null,
    })),
  })
  const removedBaselineBody = { id: 1, name: 'Alex Rivera', email: 'alex@acme-corp.example', role: 'admin' }
  const removedChangedBody = { id: 1, name: 'Alex Rivera', role: 'admin' }
  const removedBaselineSchema = extractSchema(removedBaselineBody)
  const removedChangedSchema = extractSchema(removedChangedBody)
  await prisma.schemaSnapshot.create({
    data: {
      apiId: removed.id,
      capturedAt: new Date(NOW - 2 * 24 * HOUR),
      schema: removedBaselineSchema as Prisma.InputJsonValue,
      schemaHash: hashSchema(removedBaselineSchema),
    },
  })
  await prisma.schemaSnapshot.create({
    data: {
      apiId: removed.id,
      capturedAt: new Date(NOW - 24 * HOUR),
      schema: removedChangedSchema as Prisma.InputJsonValue,
      schemaHash: hashSchema(removedChangedSchema),
    },
  })
  const removedChanges = diffSchemas(removedBaselineSchema, removedChangedSchema)
  await prisma.incident.create({
    data: {
      apiId: removed.id,
      type: 'SCHEMA_CHANGE',
      severity: classifySeverity(removedChanges),
      status: 'ACKNOWLEDGED',
      title: 'Breaking change detected — 1 field(s) removed',
      description: 'Field removed: email (was string)',
      openedAt: new Date(NOW - 24 * HOUR),
    },
  })

  // ---- 5. Type changed (WARNING, resolved): a lower-severity schema
  // change that was caught and fixed the same day. ----
  const typeChanged = await prisma.apiMonitor.upsert({
    where: { id: 'seed-schema-typechange-api' },
    update: {},
    create: {
      id: 'seed-schema-typechange-api',
      userId: user.id,
      name: 'Billing Service',
      endpointUrl: 'https://internal-api.acme-corp.example/billing/invoices',
      description: 'Returns invoice totals for the current billing period.',
      expectedStatus: 200,
      pollIntervalMinutes: 10,
      isActive: false,
    },
  })
  await resetDemoRows(typeChanged.id)
  await prisma.monitorCheck.createMany({
    data: checkSeries(typeChanged.id, 30, HOUR, () => ({
      success: true,
      httpStatus: 200,
      latencyMs: jitter(110, 40),
      errorType: null,
    })),
  })
  const typeBaselineBody = { id: 1, amount: 4999, currency: 'USD' }
  const typeChangedBody = { id: 1, amount: '49.99', currency: 'USD' }
  const typeBaselineSchema = extractSchema(typeBaselineBody)
  const typeChangedSchema = extractSchema(typeChangedBody)
  await prisma.schemaSnapshot.create({
    data: {
      apiId: typeChanged.id,
      capturedAt: new Date(NOW - 2 * 24 * HOUR),
      schema: typeBaselineSchema as Prisma.InputJsonValue,
      schemaHash: hashSchema(typeBaselineSchema),
    },
  })
  await prisma.schemaSnapshot.create({
    data: {
      apiId: typeChanged.id,
      capturedAt: new Date(NOW - 6 * HOUR),
      schema: typeChangedSchema as Prisma.InputJsonValue,
      schemaHash: hashSchema(typeChangedSchema),
    },
  })
  const typeChanges = diffSchemas(typeBaselineSchema, typeChangedSchema)
  await prisma.incident.create({
    data: {
      apiId: typeChanged.id,
      type: 'SCHEMA_CHANGE',
      severity: classifySeverity(typeChanges),
      status: 'RESOLVED',
      title: 'Schema change detected — type change in 1 field(s)',
      description: 'Type changed: amount (number → string)',
      openedAt: new Date(NOW - 6 * HOUR),
      resolvedAt: new Date(NOW - HOUR),
    },
  })

  console.log(`Seeded demo user ${user.email} (password: ${DEMO_PASSWORD}) with 5 monitors:`)
  console.log('  - GitHub API            healthy')
  console.log('  - Search Service        slow')
  console.log('  - Notifications Service outage (open incident)')
  console.log('  - User Profile Service  breaking schema change (acknowledged incident)')
  console.log('  - Billing Service       type-changed schema change (resolved incident)')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
