# GuardAPI benchmark

Reproducible load benchmark for the monitoring scheduler. Everything here is
benchmark-only: nothing under `src/` imports from this folder, and it is not
part of `npm run build`.

## What it measures

For each monitor count (default **25, 100, 500, 1000**) the runner:

1. wipes the dedicated benchmark database and seeds that many active monitors
   (`pollIntervalMinutes = 1`) pointing at a local mock HTTP target;
2. calls the real production `pollDueMonitors()` **3 times** ("cycles"),
   timing each call (or, with `--scheduler unbounded`, the benchmark-only copy of
   the original scheduler — see below);
3. reads the results back out of PostgreSQL and writes one JSON file.

| Cycle | Setup before it (not timed)                                                                                         | What it exercises                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1     | none — every monitor has never been checked, so all due                                                             | first check, baseline schema snapshot, outage opens |
| 2     | schema monitors repointed `/schema-v1` → `/schema-v2`; all checks shifted 1 h into the past so every monitor is due | schema-change incidents, outage stays open          |
| 3     | checks shifted 1 h again                                                                                            | incident de-duplication (no new incidents expected) |

Before the measured configurations, a small warm-up run (5 monitors, 2 cycles)
opens the DB pool and warms the JIT; it is discarded.

### The mock target (`mockServer.ts`)

Runs as a **separate process** so serving requests never shares an event loop
with the scheduler.

| Endpoint     | Response                                                                                |
| ------------ | --------------------------------------------------------------------------------------- |
| `/healthy`   | `200` after `MOCK_HEALTHY_DELAY_MS` (default 20 ms)                                     |
| `/slow`      | `200` after `MOCK_SLOW_DELAY_MS` (default 500 ms) or `?delayMs=`                        |
| `/error`     | `500` after `MOCK_HEALTHY_DELAY_MS`                                                     |
| `/schema-v1` | `200`, `{ id, name, email, plan: "pro" }`                                               |
| `/schema-v2` | `200`, `{ id, name, plan: { tier } }` (`email` removed, `plan` restructured → CRITICAL) |
| `/__stats`   | request count and **peak concurrent in-flight requests**                                |

### Monitor mix (deterministic, by index)

Of every 20 monitors: 14 healthy (70%), 3 slow (15%), 1 error (5%), 2 schema (10%).
So a 1,000-monitor run has 50 outage-bound monitors and 100 schema-change monitors.
The error rate in the output is therefore ≈ 5% **by design**; it is not a
product failure rate.

### Metrics captured (per configuration)

| Field                                               | How it is computed                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `monitorCount`                                      | monitors seeded                                                                                                                                                    |
| `totalChecks` / `successfulChecks` / `failedChecks` | `count(*)` over `monitor_checks` (all cycles)                                                                                                                      |
| `timedSeconds`                                      | sum of the durations of the `pollDueMonitors()` calls only (seeding/setup excluded)                                                                                |
| `checksPerSec`                                      | `totalChecks / timedSeconds`                                                                                                                                       |
| `schedulerCycleMs`                                  | duration of each `pollDueMonitors()` call, plus mean and max                                                                                                       |
| `latencyMs.p50/p95/p99`                             | PostgreSQL `percentile_cont` over the stored `monitor_checks.latency_ms` (probe latency as recorded by GuardAPI, includes the mock's artificial delay)             |
| `dbWrites`                                          | INSERTs (checks + schema snapshots + incidents opened) plus one UPDATE per resolved incident; `perSec` divides by `timedSeconds`                                   |
| `incidents`                                         | total, by type, and `duplicates`                                                                                                                                   |
| `incidents.duplicates`                              | extra concurrently-open (`OPEN`/`ACKNOWLEDGED`) incidents of the same type on the same monitor — should be `0`                                                     |
| `mock.requestsReceived`                             | requests the mock target actually served                                                                                                                           |
| `mock.peakInFlight`                                 | highest number of simultaneous requests the mock saw — the real outbound concurrency of the scheduler                                                              |
| `validation`                                        | self-checks: checks == monitors × cycles, mock requests == checks, incident counts match the seeded mix. Any failure sets `passed: false` and a non-zero exit code |

Incident emails are stubbed (as in the test suite) so results measure GuardAPI,
not an SMTP server.

## How to reproduce

Prerequisites: Node 20+, Docker (for Postgres), `npm ci` already run in `backend/`.

```bash
# from the repository root
docker compose up -d postgres          # Postgres on localhost:5432 (user/pass guardapi)

cd backend
npm run benchmark:setup                # creates guardapi_benchmark and applies the schema
npm run benchmark                      # 25 / 100 / 500 / 1000 monitors, 3 cycles each
```

Output: `benchmark/results/latest.json` (git-ignored) and a summary table on stdout.

Options (`--` passes them through npm):

```bash
npm run benchmark -- --monitors 25,100        # subset of sizes
npm run benchmark -- --cycles 5               # more cycles (min 2)
npm run benchmark -- --label mytest --out benchmark/results/mytest.json
npm run benchmark -- --note "free-text note stored in meta.note"
```

Environment variables:

| Variable                 | Default                                                                          | Purpose                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `BENCHMARK_DATABASE_URL` | `postgresql://guardapi:guardapi@localhost:5432/guardapi_benchmark?schema=public` | Target DB. **All rows are deleted.** The database name must contain `benchmark` or the runner refuses to start. |
| `MOCK_HEALTHY_DELAY_MS`  | `20`                                                                             | Latency of `/healthy`, `/error`, `/schema-*`                                                                    |
| `MOCK_SLOW_DELAY_MS`     | `500`                                                                            | Latency of `/slow`                                                                                              |

### Scheduler variants

| Flag                              | Scheduler under test                                                                                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _(default)_                       | production bounded pool; concurrency from `POLL_CONCURRENCY` (default 50)                                                                                                                    |
| `--concurrency 1`                 | production pool with one worker — sequential polling                                                                                                                                         |
| `--concurrency 10` / `25` / `100` | production pool at that limit                                                                                                                                                                |
| `--scheduler unbounded`           | `benchmark/unboundedScheduler.ts`: a verbatim copy of the pre-bounded scheduler (`Promise.allSettled` over every due monitor) plus in-flight counting. Benchmark-only; the app never uses it |

### Comparing variants: the sweep

```bash
npm run benchmark:sweep                                   # 1000/2500/5000 monitors, 1 repeat
npm run benchmark:sweep -- --monitors 1000 --repeats 3    # fewer sizes, 3 repeats each
npm run benchmark:sweep -- --variants bounded-25,unbounded --out benchmark/results/mine.json
```

It runs sequential, bounded-10/25/50/100 and unbounded, **each in its own
process** (so peak RSS is not inherited from an earlier run), and merges the
output. Sequential is only run at ≤ 1,000 monitors and once, because at larger
sizes a single run takes tens of minutes. The file contains every raw run plus
a per-variant median summary; it does not rank the variants.

Run the mock target on its own (for poking at with curl): `npm run benchmark:mock`.

## Reading the numbers

- Results depend on the machine, the Postgres container, and the mock delays.
  Every output file records the machine, Node version, git commit, and whether
  the working tree was dirty (`meta`). Compare runs only when those match.
- `checksPerSec` is _sustained throughput of the scheduler against a target that
  answers in tens of milliseconds_. It is not a claim about arbitrary real-world
  APIs, whose latency will dominate.
- Latency percentiles reflect the mock's fixed delays (20 ms / 500 ms) plus
  GuardAPI/event-loop overhead; the ~500 ms p95/p99 at small sizes is the `/slow` endpoint.
- Run-to-run variation is real. Repeat a run a few times before drawing conclusions.
