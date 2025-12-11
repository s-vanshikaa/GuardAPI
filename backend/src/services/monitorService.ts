import type { ApiMonitor, Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { probeEndpoint } from './probeService'
import { extractSchema, hashSchema, diffSchemas } from './schemaService'
import type { SchemaNode, SchemaChange } from './schemaService'
import { handleOutageIncident, handleSchemaChangeIncident } from './incidentService'

export async function recordCheck(monitor: ApiMonitor) {
  const result = await probeEndpoint(monitor.endpointUrl, monitor.expectedStatus)

  const check = await prisma.monitorCheck.create({
    data: {
      apiId: monitor.id,
      success: result.success,
      httpStatus: result.httpStatus,
      latencyMs: result.latencyMs,
      errorType: result.errorType,
    },
  })

  await handleOutageIncident(monitor.id, check)

  if (result.success && result.responseData !== null && typeof result.responseData === 'object') {
    const { changes, isNew } = await captureSchemaSnapshot(monitor.id, result.responseData)
    if (isNew && changes.length > 0) {
      await handleSchemaChangeIncident(monitor.id, changes)
    }
  }

  return check
}

// Persists a new SchemaSnapshot only when the response structure actually
// changed since the last one, so unchanged responses never create duplicates.
// Returns the diff against the previous snapshot (empty for the baseline).
export async function captureSchemaSnapshot(apiId: string, responseData: object) {
  const schema = extractSchema(responseData)
  const schemaHash = hashSchema(schema)

  const previous = await prisma.schemaSnapshot.findFirst({
    where: { apiId },
    orderBy: { capturedAt: 'desc' },
  })

  if (previous?.schemaHash === schemaHash) {
    return { snapshot: previous, changes: [] as SchemaChange[], isNew: false }
  }

  const snapshot = await prisma.schemaSnapshot.create({
    data: { apiId, schema: schema as Prisma.InputJsonValue, schemaHash },
  })

  const changes = previous ? diffSchemas(previous.schema as SchemaNode, schema) : []

  return { snapshot, changes, isNew: true }
}
