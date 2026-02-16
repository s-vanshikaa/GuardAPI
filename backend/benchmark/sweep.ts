// Runs the same workload against several scheduler variants and merges the
// results into one JSON file. Each (variant, monitor count, repeat) is its own
// runner process, so memory numbers are not polluted by earlier runs.
//
//   npm run benchmark:sweep
//   npm run benchmark:sweep -- --monitors 1000,2500,5000 --repeats 3 --out benchmark/results/x.json
//
// The script only records results; it never picks a "best" configuration.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

interface Variant {
  name: string
  args: string[]
  // A monitor count above this is skipped for the variant (sequential polling
  // at thousands of monitors takes tens of minutes per run).
  maxMonitors: number
  repeats: number
}

const DEFAULT_MONITOR_COUNTS = [1000, 2500, 5000]
const SEQUENTIAL_MAX_MONITORS = 1000

// Shape of the fields this script reads out of runner.ts output.
interface RunnerRun {
  checksPerSec: number
  schedulerCycleMs: { mean: number }
  latencyMs: { p50: number | null; p95: number | null; p99: number | null }
  polls: { maxInFlight: number }
  memory: { peakRssMb: number; peakHeapUsedMb: number }
  incidents: { duplicates: number }
  validation: { passed: boolean }
}

interface RunnerOutput {
  meta: Record<string, unknown>
  runs: RunnerRun[]
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function medianOf(runs: RunnerRun[], pick: (r: RunnerRun) => number | null): number | null {
  const values = runs.map(pick).filter((v): v is number => v !== null)
  return values.length === runs.length ? round(median(values)) : null
}

function main(): void {
  const { values } = parseArgs({
    options: {
      monitors: { type: 'string' },
      repeats: { type: 'string' },
      variants: { type: 'string' },
      out: { type: 'string' },
      note: { type: 'string' },
    },
  })

  const monitorCounts = values.monitors
    ? values.monitors.split(',').map((n) => Number(n.trim()))
    : DEFAULT_MONITOR_COUNTS
  const repeats = values.repeats ? Number(values.repeats) : 1
  if (monitorCounts.some((n) => !Number.isInteger(n) || n < 1)) {
    throw new Error('--monitors must be a comma-separated list of positive integers')
  }
  if (!Number.isInteger(repeats) || repeats < 1) throw new Error('--repeats must be >= 1')

  const allVariants: Variant[] = [
    {
      name: 'sequential',
      args: ['--concurrency', '1'],
      maxMonitors: SEQUENTIAL_MAX_MONITORS,
      repeats: 1,
    },
    ...[10, 25, 50, 100].map((c) => ({
      name: `bounded-${c}`,
      args: ['--concurrency', String(c)],
      maxMonitors: Infinity,
      repeats,
    })),
    { name: 'unbounded', args: ['--scheduler', 'unbounded'], maxMonitors: Infinity, repeats },
  ]
  const wanted = values.variants?.split(',').map((v) => v.trim())
  const variants = wanted ? allVariants.filter((v) => wanted.includes(v.name)) : allVariants

  const outFile = path.resolve(values.out ?? path.join(__dirname, 'results', 'sweep-latest.json'))
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardapi-sweep-'))
  const startedAt = new Date().toISOString()

  const results: {
    variant: string
    monitorCount: number
    repeat: number
    run: RunnerRun | null
    error?: string
  }[] = []
  let baseMeta: Record<string, unknown> | null = null

  for (const monitorCount of monitorCounts) {
    for (const variant of variants) {
      if (monitorCount > variant.maxMonitors) {
        console.log(`[sweep] skip ${variant.name} @ ${monitorCount} (above ${variant.maxMonitors})`)
        continue
      }
      for (let repeat = 1; repeat <= variant.repeats; repeat++) {
        const tmpOut = path.join(tmpDir, `${variant.name}-${monitorCount}-${repeat}.json`)
        console.log(
          `[sweep] ${variant.name} @ ${monitorCount} monitors (repeat ${repeat}/${variant.repeats})`,
        )
        const child = spawnSync(
          process.execPath,
          [
            '--import',
            'tsx',
            path.join(__dirname, 'runner.ts'),
            '--monitors',
            String(monitorCount),
            '--label',
            `${variant.name}-${monitorCount}`,
            '--out',
            tmpOut,
            ...variant.args,
          ],
          { stdio: ['ignore', 'inherit', 'inherit'], env: process.env },
        )

        if (!fs.existsSync(tmpOut)) {
          results.push({
            variant: variant.name,
            monitorCount,
            repeat,
            run: null,
            error: `runner exited with status ${child.status} and wrote no output`,
          })
          continue
        }
        const output = JSON.parse(fs.readFileSync(tmpOut, 'utf8')) as RunnerOutput
        baseMeta ??= output.meta
        results.push({ variant: variant.name, monitorCount, repeat, run: output.runs[0] })
      }
    }
  }

  const summary = variants.flatMap((variant) =>
    monitorCounts.flatMap((monitorCount) => {
      const runs = results
        .filter((r) => r.variant === variant.name && r.monitorCount === monitorCount)
        .flatMap((r) => (r.run ? [r.run] : []))
      if (runs.length === 0) return []
      return [
        {
          variant: variant.name,
          monitorCount,
          repeats: runs.length,
          allValidationsPassed: runs.every((r) => r.validation.passed),
          median: {
            checksPerSec: medianOf(runs, (r) => r.checksPerSec),
            meanCycleMs: medianOf(runs, (r) => r.schedulerCycleMs.mean),
            p50LatencyMs: medianOf(runs, (r) => r.latencyMs.p50),
            p95LatencyMs: medianOf(runs, (r) => r.latencyMs.p95),
            p99LatencyMs: medianOf(runs, (r) => r.latencyMs.p99),
            maxInFlightPolls: medianOf(runs, (r) => r.polls.maxInFlight),
            peakRssMb: medianOf(runs, (r) => r.memory.peakRssMb),
            peakHeapUsedMb: medianOf(runs, (r) => r.memory.peakHeapUsedMb),
          },
          maxDuplicateIncidents: Math.max(...runs.map((r) => r.incidents.duplicates)),
        },
      ]
    }),
  )

  const output = {
    meta: {
      note: values.note ?? null,
      startedAt,
      finishedAt: new Date().toISOString(),
      repeatsPerVariant: repeats,
      sequentialRepeats: 1,
      // machine/git/mock/mix are identical across the child runs.
      ...(baseMeta && {
        git: baseMeta.git,
        mock: baseMeta.mock,
        monitorMix: baseMeta.monitorMix,
        cyclesPerConfiguration: baseMeta.cyclesPerConfiguration,
        machine: baseMeta.machine,
      }),
    },
    summary,
    results,
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`)
  fs.rmSync(tmpDir, { recursive: true, force: true })

  console.log(
    '\nvariant        monitors  checks/s  cycle(ms)  p50    p95    p99    maxInFlight  rssMB   dup',
  )
  for (const s of summary) {
    const m = s.median
    console.log(
      [
        s.variant.padEnd(14),
        String(s.monitorCount).padEnd(9),
        String(m.checksPerSec).padEnd(9),
        String(m.meanCycleMs).padEnd(10),
        String(m.p50LatencyMs).padEnd(6),
        String(m.p95LatencyMs).padEnd(6),
        String(m.p99LatencyMs).padEnd(6),
        String(m.maxInFlightPolls).padEnd(12),
        String(m.peakRssMb).padEnd(7),
        String(s.maxDuplicateIncidents),
        s.allValidationsPassed ? '' : '  (validation failed)',
      ].join(' '),
    )
  }
  console.log(`\n[sweep] wrote ${outFile}`)
}

main()
