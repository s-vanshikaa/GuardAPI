import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type http from 'node:http'
import prisma from '../src/utils/prisma'
import {
  DEFAULT_POLL_CONCURRENCY,
  pollDueMonitors,
  resolvePollConcurrency,
} from '../src/jobs/scheduler'
import { recordCheck } from '../src/services/monitorService'
import { startTestServer } from './helpers'

// recordCheck is wrapped in a spy so tests can swap in controlled fakes
// (to observe concurrency) and still fall back to the real implementation
// (to check incident behaviour end to end).
vi.mock('../src/services/monitorService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/monitorService')>()
  return { ...actual, recordCheck: vi.fn(actual.recordCheck) }
})

// Outage incidents would otherwise try to send real email.
vi.mock('../src/services/emailService', () => ({
  sendIncidentEmail: vi.fn().mockResolvedValue(undefined),
}))

const recordCheckMock = vi.mocked(recordCheck)
let realRecordCheck: typeof recordCheck

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(async () => {
  const actual = await vi.importActual<typeof import('../src/services/monitorService')>(
    '../src/services/monitorService',
  )
  realRecordCheck = actual.recordCheck
  recordCheckMock.mockReset()
  recordCheckMock.mockImplementation(realRecordCheck)
  await prisma.user.deleteMany()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function seedMonitors(count: number, overrides: { endpointUrl?: string } = {}) {
  const user = await prisma.user.create({
    data: { email: `scheduler-${Date.now()}@example.com`, passwordHash: 'x' },
  })
  await prisma.apiMonitor.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      userId: user.id,
      name: `monitor-${String(i).padStart(3, '0')}`,
      endpointUrl: overrides.endpointUrl ?? 'http://127.0.0.1:1/unused',
      pollIntervalMinutes: 1,
    })),
  })
  return prisma.apiMonitor.findMany({ orderBy: { name: 'asc' } })
}

// A fake recordCheck that records how many calls overlap.
function trackConcurrency(delayMs: number) {
  const tracker = { active: 0, max: 0, calls: [] as string[] }
  recordCheckMock.mockImplementation(async (monitor) => {
    tracker.calls.push(monitor.name)
    tracker.active += 1
    tracker.max = Math.max(tracker.max, tracker.active)
    await sleep(delayMs)
    tracker.active -= 1
    return {} as Awaited<ReturnType<typeof recordCheck>>
  })
  return tracker
}

async function makeAllMonitorsDue() {
  await prisma.monitorCheck.updateMany({
    data: { checkedAt: new Date(Date.now() - 2 * 60_000) },
  })
}

describe('resolvePollConcurrency', () => {
  it('uses the default when POLL_CONCURRENCY is unset or blank', () => {
    expect(resolvePollConcurrency(undefined)).toBe(DEFAULT_POLL_CONCURRENCY)
    expect(resolvePollConcurrency('')).toBe(DEFAULT_POLL_CONCURRENCY)
    expect(resolvePollConcurrency('   ')).toBe(DEFAULT_POLL_CONCURRENCY)
  })

  it('accepts a positive integer', () => {
    expect(resolvePollConcurrency('1')).toBe(1)
    expect(resolvePollConcurrency('25')).toBe(25)
  })

  it.each(['0', '-4', '2.5', 'abc', '10x', 'NaN', 'Infinity'])(
    'falls back to the default (and warns) for invalid value %s',
    (raw) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      // The scheduler warns once per distinct bad value, so make it unique.
      const unique = `${raw}${'​'.repeat(raw.length)}`
      expect(resolvePollConcurrency(unique)).toBe(DEFAULT_POLL_CONCURRENCY)
      expect(warn).toHaveBeenCalledOnce()
    },
  )

  it('is read from the POLL_CONCURRENCY environment variable by default', async () => {
    vi.stubEnv('POLL_CONCURRENCY', '7')
    await seedMonitors(1)
    trackConcurrency(0)

    const stats = await pollDueMonitors()

    expect(stats.concurrency).toBe(7)
  })
})

describe('pollDueMonitors concurrency', () => {
  it('never runs more polls at once than the configured limit', async () => {
    await seedMonitors(30)
    const tracker = trackConcurrency(15)

    const stats = await pollDueMonitors({ concurrency: 4 })

    expect(tracker.max).toBeLessThanOrEqual(4)
    // The limit is actually used, not just respected trivially.
    expect(tracker.max).toBe(4)
    expect(stats.maxInFlight).toBe(tracker.max)
    expect(stats.concurrency).toBe(4)
  })

  it('behaves sequentially when concurrency is 1', async () => {
    await seedMonitors(8)
    const tracker = trackConcurrency(5)

    const stats = await pollDueMonitors({ concurrency: 1 })

    expect(tracker.max).toBe(1)
    expect(stats.maxInFlight).toBe(1)
    expect(tracker.calls).toHaveLength(8)
  })

  it('does not spawn more workers than there are due monitors', async () => {
    await seedMonitors(3)
    const tracker = trackConcurrency(5)

    const stats = await pollDueMonitors({ concurrency: 50 })

    expect(tracker.max).toBe(3)
    expect(stats.maxInFlight).toBe(3)
  })

  it('eventually polls every due monitor exactly once', async () => {
    const monitors = await seedMonitors(25)
    const tracker = trackConcurrency(3)

    const stats = await pollDueMonitors({ concurrency: 4 })

    expect([...tracker.calls].sort()).toEqual(monitors.map((m) => m.name))
    expect(stats).toMatchObject({
      skipped: false,
      monitorsDue: 25,
      checksCompleted: 25,
      failedPolls: 0,
    })
  })

  it('ignores inactive monitors', async () => {
    const monitors = await seedMonitors(5)
    await prisma.apiMonitor.update({ where: { id: monitors[0].id }, data: { isActive: false } })
    const tracker = trackConcurrency(1)

    const stats = await pollDueMonitors({ concurrency: 3 })

    expect(stats.monitorsDue).toBe(4)
    expect(tracker.calls).not.toContain(monitors[0].name)
  })

  it('reports throughput and duration for the cycle', async () => {
    await seedMonitors(6)
    trackConcurrency(10)

    const stats = await pollDueMonitors({ concurrency: 2 })

    expect(stats.durationMs).toBeGreaterThan(0)
    expect(stats.checksPerSec).toBeGreaterThan(0)
  })
})

describe('pollDueMonitors failure isolation', () => {
  it('keeps polling the rest of the batch when one poll rejects', async () => {
    const monitors = await seedMonitors(10)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const polled: string[] = []
    recordCheckMock.mockImplementation(async (monitor) => {
      polled.push(monitor.name)
      if (monitor.id === monitors[2].id) throw new Error('boom')
      await sleep(2)
      return {} as Awaited<ReturnType<typeof recordCheck>>
    })

    const stats = await pollDueMonitors({ concurrency: 3 })

    expect(polled).toHaveLength(10)
    expect(stats).toMatchObject({ monitorsDue: 10, checksCompleted: 9, failedPolls: 1 })
  })

  it('still persists checks for healthy monitors when another poll throws', async () => {
    const started = startTestServer()
    try {
      const monitors = await seedMonitors(4, { endpointUrl: started.url })
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      recordCheckMock.mockImplementation(async (monitor) => {
        if (monitor.id === monitors[0].id) throw new Error('boom')
        return realRecordCheck(monitor)
      })

      await pollDueMonitors({ concurrency: 2 })

      const checks = await prisma.monitorCheck.findMany()
      expect(checks).toHaveLength(3)
      expect(checks.map((c) => c.apiId)).not.toContain(monitors[0].id)
    } finally {
      await new Promise((resolve) => started.server.close(resolve))
    }
  })
})

describe('overlapping scheduler cycles', () => {
  it('skips a cycle that starts while another is still running', async () => {
    await seedMonitors(3)
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    recordCheckMock.mockImplementation(async () => {
      await gate
      return {} as Awaited<ReturnType<typeof recordCheck>>
    })

    const first = pollDueMonitors({ concurrency: 2 })
    try {
      // Wait until the first cycle is genuinely mid-flight (2 workers blocked).
      await vi.waitFor(() => expect(recordCheckMock).toHaveBeenCalledTimes(2))

      const second = await pollDueMonitors({ concurrency: 2 })

      expect(second).toMatchObject({ skipped: true, monitorsDue: 0, checksCompleted: 0 })
      expect(recordCheckMock).toHaveBeenCalledTimes(2) // the skipped cycle polled nothing
    } finally {
      release() // never leave the guard held if an assertion above fails
    }

    const firstStats = await first
    expect(firstStats).toMatchObject({ skipped: false, checksCompleted: 3 })
    expect(recordCheckMock).toHaveBeenCalledTimes(3)
  })

  it('runs the next cycle once the previous one has finished', async () => {
    await seedMonitors(3)
    const tracker = trackConcurrency(2)

    const first = await pollDueMonitors({ concurrency: 2 })
    const second = await pollDueMonitors({ concurrency: 2 })

    expect(first.skipped).toBe(false)
    expect(second.skipped).toBe(false)
    expect(tracker.calls).toHaveLength(6)
  })

  it('releases the guard when a cycle fails before polling anything', async () => {
    await seedMonitors(2)
    trackConcurrency(1)
    vi.spyOn(prisma.apiMonitor, 'findMany').mockRejectedValueOnce(new Error('db down'))

    await expect(pollDueMonitors()).rejects.toThrow('db down')

    const next = await pollDueMonitors()
    expect(next).toMatchObject({ skipped: false, checksCompleted: 2 })
  })
})

describe('incident behaviour under concurrent polling', () => {
  let server: http.Server | undefined
  let respondStatus = 500

  afterEach(async () => {
    if (server) await new Promise((resolve) => server?.close(resolve))
    server = undefined
    respondStatus = 500
  })

  function startServer() {
    const started = startTestServer((_req, res) => {
      res.writeHead(respondStatus).end('{}')
    })
    server = started.server
    return started.url
  }

  it('opens exactly one outage incident per failing monitor across repeated cycles', async () => {
    await seedMonitors(12, { endpointUrl: startServer() })

    for (let cycle = 0; cycle < 3; cycle++) {
      if (cycle > 0) await makeAllMonitorsDue()
      await pollDueMonitors({ concurrency: 5 })
    }

    expect(await prisma.monitorCheck.count()).toBe(36)
    const incidents = await prisma.incident.findMany()
    expect(incidents).toHaveLength(12)
    expect(new Set(incidents.map((i) => i.apiId)).size).toBe(12)
    expect(incidents.every((i) => i.type === 'OUTAGE' && i.status === 'OPEN')).toBe(true)
  })

  it('does not double-poll or double-open incidents when two cycles are triggered together', async () => {
    await seedMonitors(8, { endpointUrl: startServer() })

    const [a, b] = await Promise.all([
      pollDueMonitors({ concurrency: 4 }),
      pollDueMonitors({ concurrency: 4 }),
    ])

    expect([a.skipped, b.skipped].filter(Boolean)).toHaveLength(1)
    expect(await prisma.monitorCheck.count()).toBe(8)
    expect(await prisma.incident.count()).toBe(8)
  })

  it('resolves each outage once the endpoint recovers', async () => {
    await seedMonitors(6, { endpointUrl: startServer() })

    await pollDueMonitors({ concurrency: 3 })
    respondStatus = 200
    await makeAllMonitorsDue()
    await pollDueMonitors({ concurrency: 3 })

    const incidents = await prisma.incident.findMany()
    expect(incidents).toHaveLength(6)
    expect(incidents.every((i) => i.status === 'RESOLVED' && i.resolvedAt !== null)).toBe(true)
  })
})
