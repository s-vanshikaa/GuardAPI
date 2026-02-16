// Benchmark-only copy of the scheduler as it existed before Commit 2: every
// due monitor is polled at once via Promise.allSettled, with no cap. Kept so
// the bounded scheduler can be compared against the original behaviour on the
// same workload. It is NOT used by the application.
import prisma from '../src/utils/prisma'
import { recordCheck } from '../src/services/monitorService'

export interface UnboundedCycleStats {
  monitorsDue: number
  checksCompleted: number
  failedPolls: number
  maxInFlight: number
}

export async function pollDueMonitorsUnbounded(): Promise<UnboundedCycleStats> {
  const monitors = await prisma.apiMonitor.findMany({
    where: { isActive: true },
    include: { monitorChecks: { orderBy: { checkedAt: 'desc' }, take: 1 } },
  })

  const due = monitors.filter((monitor) => {
    const [lastCheck] = monitor.monitorChecks
    if (!lastCheck) return true
    const dueAt = lastCheck.checkedAt.getTime() + monitor.pollIntervalMinutes * 60_000
    return dueAt <= Date.now()
  })

  // Only instrumentation was added around the original recordCheck call.
  let inFlight = 0
  let maxInFlight = 0
  const settled = await Promise.allSettled(
    due.map(async (monitor) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      try {
        return await recordCheck(monitor)
      } finally {
        inFlight -= 1
      }
    }),
  )

  const failedPolls = settled.filter((s) => s.status === 'rejected').length
  return {
    monitorsDue: due.length,
    checksCompleted: settled.length - failedPolls,
    failedPolls,
    maxInFlight,
  }
}
