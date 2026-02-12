// GuardAPI benchmark runner.
//
//   npm run benchmark                               # 25, 100, 500, 1000 monitors
//   npm run benchmark -- --monitors 25,100 --cycles 3 --label baseline --out benchmark/results/x.json
//
// For each monitor count it: wipes the benchmark database, seeds monitors that
// point at the mock target, then times real calls to the production
// `pollDueMonitors()` scheduler function, and finally reads every metric back
// out of PostgreSQL. See benchmark/README.md.
import './env' // must stay first — configures DATABASE_URL before src/ loads
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { parseArgs } from 'node:util'
import prisma from '../src/utils/prisma'
import { pollDueMonitors } from '../src/jobs/scheduler'
import { benchmarkDatabaseName } from './env'
import {
  expectedCounts,
  flipSchemaMonitorsToV2,
  makeAllMonitorsDue,
  resetDatabase,
  seedMonitors,
} from './seed'

const DEFAULT_MONITOR_COUNTS = [25, 100, 500, 1000]
const DEFAULT_CYCLES = 3
const WARMUP_MONITORS = 5

interface MockStats {
  requests: number
  peakInFlight: number
}

interface MockSummary {
  requestsReceived: number
  peakInFlight: number
}

interface RunResult {
  monitorCount: number
  cycles: number
  totalChecks: number
  successfulChecks: number
  failedChecks: number
  errorRate: number
  timedSeconds: number
  checksPerSec: number
  schedulerCycleMs: { perCycle: number[]; mean: number; max: number }
  latencyMs: { p50: number | null; p95: number | null; p99: number | null }
  dbWrites: {
    total: number
    perSec: number
    breakdown: {
      checks: number
      schemaSnapshots: number
      incidentsOpened: number
      incidentsResolved: number
    }
  }
  incidents: { total: number; outage: number; schemaChange: number; duplicates: number }
  mock: { requestsReceived: number; peakInFlight: number }
  validation: { passed: boolean; problems: string[] }
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function gitInfo(): { commit: string | null; dirty: boolean | null } {
  try {
    const run = (cmd: string) =>
      execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return {
      commit: run('git rev-parse HEAD').trim(),
      // Untracked benchmark output is expected, so only tracked changes count.
      dirty: run('git status --porcelain --untracked-files=no').trim().length > 0,
    }
  } catch {
    return { commit: null, dirty: null }
  }
}

async function startMockServer(): Promise<{ child: ChildProcess; baseUrl: string }> {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', path.join(__dirname, 'mockServer.ts')],
    {
      env: { ...process.env, MOCK_PORT: '0' },
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  )

  const port = await new Promise<number>((resolve, reject) => {
    let buffer = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const match = buffer.match(/MOCK_LISTENING (\d+)/)
      if (match) resolve(Number(match[1]))
    })
    child.once('error', reject)
    child.once('exit', (code) => reject(new Error(`mock server exited early (code ${code})`)))
  })

  return { child, baseUrl: `http://127.0.0.1:${port}` }
}

async function mockRequest<T>(baseUrl: string, pathname: string): Promise<T> {
  const res = await fetch(`${baseUrl}${pathname}`)
  return (await res.json()) as T
}

interface CountRow {
  count: bigint
}

async function count(query: Promise<CountRow[]>): Promise<number> {
  const [row] = await query
  return Number(row.count)
}

async function collectMetrics(
  monitorCount: number,
  cycleDurationsMs: number[],
  mock: MockSummary,
): Promise<RunResult> {
  const totalChecks = await count(prisma.$queryRaw<CountRow[]>`SELECT count(*) FROM monitor_checks`)
  const successfulChecks = await count(
    prisma.$queryRaw<CountRow[]>`SELECT count(*) FROM monitor_checks WHERE success`,
  )
  const failedChecks = totalChecks - successfulChecks

  const [latency] = await prisma.$queryRaw<
    { p50: number | null; p95: number | null; p99: number | null }[]
  >`
    SELECT
      (percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms))::float8 AS p50,
      (percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::float8 AS p95,
      (percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms))::float8 AS p99
    FROM monitor_checks`

  const schemaSnapshots = await count(
    prisma.$queryRaw<CountRow[]>`SELECT count(*) FROM schema_snapshots`,
  )
  const incidentsOpened = await count(prisma.$queryRaw<CountRow[]>`SELECT count(*) FROM incidents`)
  const incidentsResolved = await count(
    prisma.$queryRaw<CountRow[]>`SELECT count(*) FROM incidents WHERE status = 'RESOLVED'`,
  )
  const outage = await count(
    prisma.$queryRaw<CountRow[]>`SELECT count(*) FROM incidents WHERE type = 'OUTAGE'`,
  )
  const schemaChange = await count(
    prisma.$queryRaw<CountRow[]>`SELECT count(*) FROM incidents WHERE type = 'SCHEMA_CHANGE'`,
  )

  // A duplicate is an *extra* concurrently-open incident of the same type on
  // the same monitor. Opening, resolving and later re-opening is legitimate.
  const [dupRow] = await prisma.$queryRaw<{ duplicates: bigint }[]>`
    SELECT COALESCE(SUM(n - 1), 0) AS duplicates FROM (
      SELECT count(*) AS n FROM incidents
      WHERE status IN ('OPEN', 'ACKNOWLEDGED')
      GROUP BY api_id, type
      HAVING count(*) > 1
    ) grouped`

  const timedMs = cycleDurationsMs.reduce((sum, ms) => sum + ms, 0)
  const timedSeconds = timedMs / 1000
  // Every INSERT, plus one UPDATE per resolved incident.
  const dbWritesTotal = totalChecks + schemaSnapshots + incidentsOpened + incidentsResolved

  const cycles = cycleDurationsMs.length
  const expected = expectedCounts(monitorCount)
  const problems: string[] = []
  if (totalChecks !== monitorCount * cycles) {
    problems.push(`expected ${monitorCount * cycles} checks, found ${totalChecks}`)
  }
  if (mock.requestsReceived !== totalChecks) {
    problems.push(`mock target served ${mock.requestsReceived} requests for ${totalChecks} checks`)
  }
  if (outage !== expected.error) {
    problems.push(`expected ${expected.error} outage incidents, found ${outage}`)
  }
  if (schemaChange !== expected.schema) {
    problems.push(`expected ${expected.schema} schema-change incidents, found ${schemaChange}`)
  }

  return {
    monitorCount,
    cycles,
    totalChecks,
    successfulChecks,
    failedChecks,
    errorRate: totalChecks > 0 ? round(failedChecks / totalChecks, 4) : 0,
    timedSeconds: round(timedSeconds, 3),
    checksPerSec: round(totalChecks / timedSeconds, 2),
    schedulerCycleMs: {
      perCycle: cycleDurationsMs.map((ms) => round(ms, 1)),
      mean: round(timedMs / cycles, 1),
      max: round(Math.max(...cycleDurationsMs), 1),
    },
    latencyMs: {
      p50: latency.p50 === null ? null : round(latency.p50, 1),
      p95: latency.p95 === null ? null : round(latency.p95, 1),
      p99: latency.p99 === null ? null : round(latency.p99, 1),
    },
    dbWrites: {
      total: dbWritesTotal,
      perSec: round(dbWritesTotal / timedSeconds, 2),
      breakdown: { checks: totalChecks, schemaSnapshots, incidentsOpened, incidentsResolved },
    },
    incidents: {
      total: incidentsOpened,
      outage,
      schemaChange,
      duplicates: Number(dupRow.duplicates),
    },
    mock: { requestsReceived: mock.requestsReceived, peakInFlight: mock.peakInFlight },
    validation: { passed: problems.length === 0, problems },
  }
}

async function runConfiguration(
  monitorCount: number,
  cycles: number,
  mockBaseUrl: string,
): Promise<RunResult> {
  await resetDatabase(prisma)
  await seedMonitors(prisma, monitorCount, mockBaseUrl)
  await mockRequest(mockBaseUrl, '/__reset')

  const cycleDurationsMs: number[] = []
  for (let cycle = 1; cycle <= cycles; cycle++) {
    // Setup between cycles is deliberately outside the timed region.
    if (cycle > 1) await makeAllMonitorsDue(prisma)
    if (cycle === 2) await flipSchemaMonitorsToV2(prisma)

    const startedAt = performance.now()
    await pollDueMonitors()
    cycleDurationsMs.push(performance.now() - startedAt)
  }

  const mockStats = await mockRequest<MockStats>(mockBaseUrl, '/__stats')
  return collectMetrics(monitorCount, cycleDurationsMs, {
    requestsReceived: mockStats.requests,
    peakInFlight: mockStats.peakInFlight,
  })
}

function printSummary(results: RunResult[]): void {
  console.log(
    '\nmonitors  checks  failed  checks/s  cycle(ms)  p50   p95   p99   dupIncidents  valid',
  )
  for (const r of results) {
    console.log(
      [
        String(r.monitorCount).padEnd(9),
        String(r.totalChecks).padEnd(7),
        String(r.failedChecks).padEnd(7),
        String(r.checksPerSec).padEnd(9),
        String(r.schedulerCycleMs.mean).padEnd(10),
        String(r.latencyMs.p50).padEnd(5),
        String(r.latencyMs.p95).padEnd(5),
        String(r.latencyMs.p99).padEnd(5),
        String(r.incidents.duplicates).padEnd(13),
        r.validation.passed ? 'yes' : 'NO',
      ].join(' '),
    )
    for (const problem of r.validation.problems) console.log(`   ! ${problem}`)
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      monitors: { type: 'string' },
      cycles: { type: 'string' },
      label: { type: 'string' },
      out: { type: 'string' },
      note: { type: 'string' },
    },
  })

  const monitorCounts = values.monitors
    ? values.monitors.split(',').map((n) => Number(n.trim()))
    : DEFAULT_MONITOR_COUNTS
  const cycles = values.cycles ? Number(values.cycles) : DEFAULT_CYCLES
  if (monitorCounts.some((n) => !Number.isInteger(n) || n < 1)) {
    throw new Error('--monitors must be a comma-separated list of positive integers')
  }
  if (!Number.isInteger(cycles) || cycles < 2) {
    throw new Error('--cycles must be an integer >= 2 (cycle 2 is when schema changes appear)')
  }

  const label = values.label ?? 'latest'
  const outFile = path.resolve(values.out ?? path.join(__dirname, 'results', `${label}.json`))

  const { child: mockProcess, baseUrl } = await startMockServer()
  try {
    console.log(`[benchmark] label=${label} db=${benchmarkDatabaseName} mock=${baseUrl}`)

    // Warm-up: open the DB pool and JIT the hot paths, results discarded.
    await runConfiguration(WARMUP_MONITORS, 2, baseUrl)

    const startedAt = new Date().toISOString()
    const runs: RunResult[] = []
    for (const monitorCount of monitorCounts) {
      console.log(`[benchmark] ${monitorCount} monitors x ${cycles} cycles ...`)
      runs.push(await runConfiguration(monitorCount, cycles, baseUrl))
    }

    const mockConfig = {
      healthyDelayMs: Number(process.env.MOCK_HEALTHY_DELAY_MS ?? 20),
      slowDelayMs: Number(process.env.MOCK_SLOW_DELAY_MS ?? 500),
    }
    const output = {
      meta: {
        label,
        note: values.note ?? null,
        startedAt,
        finishedAt: new Date().toISOString(),
        git: gitInfo(),
        pollConcurrency: process.env.POLL_CONCURRENCY ?? null,
        cyclesPerConfiguration: cycles,
        mock: mockConfig,
        monitorMix: { healthy: '70%', slow: '15%', error: '5%', schema: '10%' },
        machine: {
          node: process.version,
          platform: `${os.platform()} ${os.arch()}`,
          cpu: os.cpus()[0]?.model ?? 'unknown',
          logicalCpus: os.cpus().length,
          memoryGb: round(os.totalmem() / 1024 ** 3, 1),
        },
      },
      runs,
    }

    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    fs.writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`)
    printSummary(runs)
    console.log(`\n[benchmark] wrote ${outFile}`)

    if (runs.some((r) => !r.validation.passed)) process.exitCode = 1
  } finally {
    mockProcess.kill('SIGTERM')
    await prisma.$disconnect()
  }
}

main().catch((err: unknown) => {
  console.error('[benchmark] failed:', err)
  process.exit(1)
})
