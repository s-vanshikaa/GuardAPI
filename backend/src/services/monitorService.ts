import type { ApiMonitor } from '@prisma/client'
import prisma from '../utils/prisma'
import { probeEndpoint } from './probeService'

export async function recordCheck(monitor: ApiMonitor) {
  const result = await probeEndpoint(monitor.endpointUrl, monitor.expectedStatus)

  return prisma.monitorCheck.create({
    data: {
      apiId: monitor.id,
      success: result.success,
      httpStatus: result.httpStatus,
      latencyMs: result.latencyMs,
      errorType: result.errorType,
    },
  })
}
