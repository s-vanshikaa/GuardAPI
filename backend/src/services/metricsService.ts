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

interface RollingAggregateRow {
  totalChecks: bigint
  successfulChecks: bigint
  averageLatencyMs: number | null
  p50LatencyMs: number | null
  p95LatencyMs: number | null
  p99LatencyMs: number | null
}

// Rolling 24h check counts and latency percentiles for one monitor, computed
// entirely by Postgres (count/avg/percentile_cont all ignore NULL latency_ms
// values) so a monitor's full check history is never loaded into app memory.
async function getRollingAggregate(apiId: string): Promise<RollingAggregateRow> {
  const [row] = await prisma.$queryRaw<RollingAggregateRow[]>`
    SELECT
      count(*) AS "totalChecks",
      count(*) FILTER (WHERE success) AS "successfulChecks",
      avg(latency_ms)::float8 AS "averageLatencyMs",
      (percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms))::float8 AS "p50LatencyMs",
      (percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::float8 AS "p95LatencyMs",
      (percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms))::float8 AS "p99LatencyMs"
    FROM monitor_checks
    WHERE api_id = ${apiId}
      AND checked_at >= now() - interval '24 hours'
  `
  return row
}

export async function getMonitorMetrics(userId: string, apiId: string) {
  await apiMonitorService.getApiMonitor(userId, apiId)

  const [latest, rolling] = await Promise.all([
    prisma.monitorCheck.findFirst({ where: { apiId }, orderBy: { checkedAt: 'desc' } }),
    getRollingAggregate(apiId),
  ])

  const totalChecks = Number(rolling.totalChecks)
  const successfulChecks = Number(rolling.successfulChecks)
  const failedChecks = totalChecks - successfulChecks

  const round1 = (value: number) => Math.round(value * 10) / 10
  const round0 = (value: number) => Math.round(value)

  return {
    currentHealth: latest ? (latest.success ? 'healthy' : 'down') : 'unknown',
    latestHttpStatus: latest?.httpStatus ?? null,
    latestLatencyMs: latest?.latencyMs ?? null,
    lastCheckedAt: latest?.checkedAt ?? null,
    uptimePercentage: totalChecks > 0 ? round1((successfulChecks / totalChecks) * 100) : null,
    averageLatencyMs: rolling.averageLatencyMs !== null ? round0(rolling.averageLatencyMs) : null,
    p50LatencyMs: rolling.p50LatencyMs !== null ? round0(rolling.p50LatencyMs) : null,
    p95LatencyMs: rolling.p95LatencyMs !== null ? round0(rolling.p95LatencyMs) : null,
    p99LatencyMs: rolling.p99LatencyMs !== null ? round0(rolling.p99LatencyMs) : null,
    totalChecks,
    successfulChecks,
    failedChecks,
  }
}
