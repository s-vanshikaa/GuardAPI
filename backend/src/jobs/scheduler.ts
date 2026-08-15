import cron from 'node-cron'
import prisma from '../utils/prisma'
import { recordCheck } from '../services/monitorService'

export async function pollDueMonitors() {
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

  await Promise.allSettled(due.map((monitor) => recordCheck(monitor)))
}

export function startScheduler() {
  cron.schedule('* * * * *', () => {
    pollDueMonitors().catch((err: unknown) => {
      console.error('[scheduler] poll cycle failed:', err)
    })
  })
}
