import prisma from '../utils/prisma'
import * as apiMonitorService from './apiMonitorService'

export async function listMonitorChecks(userId: string, apiId: string, limit: number) {
  await apiMonitorService.getApiMonitor(userId, apiId)
  return prisma.monitorCheck.findMany({
    where: { apiId },
    orderBy: { checkedAt: 'desc' },
    take: limit,
  })
}

export async function getMonitorMetrics(userId: string, apiId: string) {
  await apiMonitorService.getApiMonitor(userId, apiId)

  const [latest, aggregate, failedChecks] = await Promise.all([
    prisma.monitorCheck.findFirst({ where: { apiId }, orderBy: { checkedAt: 'desc' } }),
    prisma.monitorCheck.aggregate({ where: { apiId }, _avg: { latencyMs: true }, _count: true }),
    prisma.monitorCheck.count({ where: { apiId, success: false } }),
  ])

  const totalChecks = aggregate._count
  const averageLatencyMs =
    aggregate._avg.latencyMs !== null ? Math.round(aggregate._avg.latencyMs) : null
  const uptimePercentage =
    totalChecks > 0 ? Math.round(((totalChecks - failedChecks) / totalChecks) * 1000) / 10 : null

  return {
    currentHealth: latest ? (latest.success ? 'healthy' : 'down') : 'unknown',
    latestHttpStatus: latest?.httpStatus ?? null,
    latestLatencyMs: latest?.latencyMs ?? null,
    averageLatencyMs,
    uptimePercentage,
    totalChecks,
    failedChecks,
  }
}
