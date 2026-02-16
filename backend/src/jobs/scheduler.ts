import cron from 'node-cron'
import type { ApiMonitor } from '@prisma/client'
import prisma from '../utils/prisma'
import { recordCheck } from '../services/monitorService'

export const DEFAULT_POLL_CONCURRENCY = 50

const warnedConcurrencyValues = new Set<string>()

// POLL_CONCURRENCY must be a positive integer. Anything else (unset, empty,
// "abc", "0", "2.5", "-3") falls back to the default rather than crashing the
// scheduler or silently disabling polling; a bad value is warned about once.
export function resolvePollConcurrency(raw: string | undefined = process.env.POLL_CONCURRENCY) {
  if (raw === undefined || raw.trim() === '') return DEFAULT_POLL_CONCURRENCY

  const parsed = Number(raw)
  if (Number.isInteger(parsed) && parsed >= 1) return parsed

  if (!warnedConcurrencyValues.has(raw)) {
    warnedConcurrencyValues.add(raw)
    console.warn(
      `[scheduler] ignoring invalid POLL_CONCURRENCY="${raw}" (expected a positive integer); ` +
        `using ${DEFAULT_POLL_CONCURRENCY}`,
    )
  }
  return DEFAULT_POLL_CONCURRENCY
}

export interface PollCycleStats {
  // True when another cycle was already running in this process and this call
  // did nothing. All other fields are zero in that case.
  skipped: boolean
  concurrency: number
  monitorsDue: number
  // Polls whose recordCheck finished and persisted a check (the check itself
  // may record a failed probe — that still counts as completed).
  checksCompleted: number
  // Polls where recordCheck threw (e.g. a database error). One of these never
  // stops the rest of the batch.
  failedPolls: number
  // Highest number of recordCheck calls running at the same time.
  maxInFlight: number
  durationMs: number
  checksPerSec: number
}

interface PoolResult {
  completed: number
  failed: number
  maxInFlight: number
}

// Runs `worker` over `items` with at most `limit` running at once. `limit`
// workers pull the next item from a shared cursor, so a slow item never holds
// up the others. Each item is wrapped in its own try/catch — the same error
// isolation Promise.allSettled gave — so one rejection cannot stop the batch.
async function runBounded<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<unknown>,
): Promise<PoolResult> {
  const result: PoolResult = { completed: 0, failed: 0, maxInFlight: 0 }
  let next = 0
  let inFlight = 0

  async function drain(): Promise<void> {
    while (next < items.length) {
      const item = items[next++]
      inFlight += 1
      result.maxInFlight = Math.max(result.maxInFlight, inFlight)
      try {
        await worker(item)
        result.completed += 1
      } catch (err) {
        result.failed += 1
        console.error('[scheduler] poll failed:', err)
      } finally {
        inFlight -= 1
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, drain))
  return result
}

async function findDueMonitors(): Promise<ApiMonitor[]> {
  const monitors = await prisma.apiMonitor.findMany({
    where: { isActive: true },
    include: { monitorChecks: { orderBy: { checkedAt: 'desc' }, take: 1 } },
  })

  return monitors.filter((monitor) => {
    const [lastCheck] = monitor.monitorChecks
    if (!lastCheck) return true
    const dueAt = lastCheck.checkedAt.getTime() + monitor.pollIntervalMinutes * 60_000
    return dueAt <= Date.now()
  })
}

// Guards against overlapping cycles within this process: if a cycle is still
// running when the next cron tick (or any other caller) arrives, the newcomer
// is skipped instead of polling the same monitors a second time. Not
// cross-process — running several backend instances needs a shared lock.
let cycleRunning = false

export async function pollDueMonitors(
  options: { concurrency?: number } = {},
): Promise<PollCycleStats> {
  const concurrency = options.concurrency ?? resolvePollConcurrency()

  if (cycleRunning) {
    return {
      skipped: true,
      concurrency,
      monitorsDue: 0,
      checksCompleted: 0,
      failedPolls: 0,
      maxInFlight: 0,
      durationMs: 0,
      checksPerSec: 0,
    }
  }

  cycleRunning = true
  const startedAt = performance.now()
  try {
    const due = await findDueMonitors()
    const pool = await runBounded(due, concurrency, (monitor) => recordCheck(monitor))
    const durationMs = performance.now() - startedAt

    return {
      skipped: false,
      concurrency,
      monitorsDue: due.length,
      checksCompleted: pool.completed,
      failedPolls: pool.failed,
      maxInFlight: pool.maxInFlight,
      durationMs,
      checksPerSec: durationMs > 0 ? pool.completed / (durationMs / 1000) : 0,
    }
  } finally {
    cycleRunning = false
  }
}

export function startScheduler() {
  cron.schedule('* * * * *', () => {
    pollDueMonitors()
      .then((stats) => {
        if (stats.skipped) {
          console.warn('[scheduler] previous poll cycle still running; skipping this tick')
        }
      })
      .catch((err: unknown) => {
        console.error('[scheduler] poll cycle failed:', err)
      })
  })
}
