# GuardAPI scheduler benchmark — results

Every number on this page comes directly from a committed JSON file in this
folder. No number here is estimated, rounded up, or extrapolated beyond what
is explicitly labeled as an estimate in the "Estimated daily throughput"
section. See `benchmark/README.md` for how the harness works.

**Machine:** Apple M3, 8 logical CPUs, 8 GB RAM, Node v24.20.0, macOS (darwin arm64).
Numbers are specific to this machine and this mock target; see "Limitations" below.

## What was compared, and why the finding isn't a simple speedup

The scheduler already polled every due monitor at once (`Promise.allSettled`
over the full batch, no cap) before this work started. Commit 2 replaced that
with a bounded worker pool (`POLL_CONCURRENCY`, default 50) so the number of
simultaneous outbound connections and in-process memory use stay flat as the
monitor count grows, instead of scaling 1:1 with it.

That means **raw throughput at the sizes below is not the benefit** — capping
concurrency at 50 against a mock target that answers in ~20 ms cannot beat
firing all requests at once. The two runs below make that trade-off explicit
rather than hide it. The actual payoff — bounded memory and flat latency —
only shows up once the monitor count is large enough that "everything at
once" starts to hurt, which is the second table further down.

## Reproducing these files

```bash
docker compose up -d postgres
cd backend
npm run benchmark:setup

# benchmark/results/baseline.json and optimized.json (this table):
npm run benchmark -- --label baseline  --out benchmark/results/baseline.json   # on the pre-Commit-2 scheduler (git stash the bounded-pool changes first)
npm run benchmark -- --label optimized --out benchmark/results/optimized.json  # on the current scheduler (default POLL_CONCURRENCY=50)

# benchmark/results/concurrency-sweep.json (the scaling table further down, ~45 min):
npm run benchmark:sweep -- --monitors 1000,2500,5000 --repeats 3 --out benchmark/results/concurrency-sweep.json
```

`baseline.json` was captured at commit `00465a6` (immediately before the
Commit 2 scheduler change); `optimized.json` at commit `bca0bcc` (Commit 2
committed, default `POLL_CONCURRENCY=50`, no `--concurrency` override). Both
are single runs of 25/100/500/1,000 monitors × 3 cycles — the same
methodology, so they're directly comparable. `concurrency-sweep.json` is the
median of 3 repeats per configuration (1 repeat for `sequential`, which is
too slow to repeat 3× at scale) and runs each scheduler variant as its own
process.

## Baseline vs. optimized (25 / 100 / 500 / 1,000 monitors, 3 cycles each)

| Monitors | Checks completed | checks/sec (baseline → optimized) | Scheduler cycle mean, ms (baseline → optimized) | p50, ms | p95, ms | p99, ms | Error rate | Duplicate incidents |
| -------: | ----------------: | ---------------------------------: | -----------------------------------------------: | ------: | ------: | ------: | ---------: | -------------------: |
|       25 |            75 → 75 |               47.66 → 45.78 (−3.9%) |                          524.6 → 546.1 (+4.1%)   | 28 → 33 | 507.3 → 516.3 | 510 → 520   | 0.04 → 0.04 | 0 → 0 |
|      100 |          300 → 300 |             183.88 → 168.78 (−8.2%) |                          543.8 → 592.5 (+9.0%)   | 39 → 27 | 518.0 → 505.1 | 525 → 508   | 0.05 → 0.05 | 0 → 0 |
|      500 |        1500 → 1500 |            801.52 → 389.17 (−51.4%) |                        623.8 → 1284.8 (+106.0%)  | 66 → 21 | 547.1 → 502.0 | 569 → 504   | 0.05 → 0.05 | 0 → 0 |
|    1,000 |        3000 → 3000 |           1387.57 → 251.86 (−81.8%) |                        720.7 → 3970.4 (+450.9%)  | 140 → 22 | 598.0 → 506.0 | 631 → 783.1 | 0.05 → 0.05 | 0 → 0 |

Source: `baseline.json` runs[0..3], `optimized.json` runs[0..3].

**Read honestly:** at every size tested here, the bounded pool (default
concurrency 50) completes the same batch of checks in a *longer* wall-clock
time than the original unbounded scheduler — the gap widens with monitor
count because once the batch exceeds the 50-worker limit, extra monitors
queue instead of firing immediately. **This is not a throughput win over the
old scheduler at these sizes, and this document does not claim one.**

What *did* stay constant: the error rate (0.04–0.05, matching the seeded 5%
error-monitor mix exactly in both runs) and duplicate incidents (0 in both).
The concurrency change did not alter failure handling or incident semantics.
p95/p99 are close in both runs at these sizes because they're dominated by
the mock's fixed 500 ms `/slow` endpoint delay, not by scheduler behavior, at
25–500 monitors.

## Where bounding pays off: 1,000 / 2,500 / 5,000 monitors

Median of 3 repeats (1 for `sequential`) per configuration. Source:
`concurrency-sweep.json`, `summary`.

| Variant | Monitors | checks/sec | Cycle mean, ms | p95, ms | p99, ms | Max simultaneous outbound connections | Peak heap, MB |
| ------- | -------: | ---------: | --------------: | ------: | ------: | -------------------------------------: | -------------: |
| sequential (concurrency=1) | 1,000 | 9.36 | 106,866.1 | 504.0 | 512.0 | 1 | 97.5 |
| bounded (concurrency=50, the default) | 1,000 | 381.57 | 2,620.8 | 502.0 | 505.0 | 50 | 127.8 |
| unbounded (original scheduler) | 1,000 | 939.97 | 1,063.9 | 736.0 | 823.0 | 1,000 | 179.5 |
| bounded (concurrency=50) | 2,500 | 337.70 | 7,403.0 | 505.0 | 526.0 | 50 | 183.3 |
| unbounded (original scheduler) | 2,500 | 260.50 | 9,596.9 | 3,545.1 | 3,746.0 | 2,500 | 369.8 |
| bounded (concurrency=50) | 5,000 | 313.38 | 15,955.2 | 508.0 | 539.0 | 50 | 198.1 |
| unbounded (original scheduler) | 5,000 | 225.76 | 22,147.9 | 4,048.3 | 4,933.0 | 5,000 | 799.8 |

All rows: 0 duplicate incidents, all validations passed.

**Three things this table shows, each backed by the numbers above:**

1. **The bounded pool beats doing it one at a time by a wide margin.**
   At 1,000 monitors, bounded(50) is **40.8×** the throughput of sequential
   (381.57 vs 9.36 checks/sec) and cuts scheduler cycle time by **97.5%**
   (2,620.8 ms vs 106,866.1 ms). This is the honest "throughput improvement"
   claim this work supports — against sequential polling, not against the
   unbounded scheduler.
2. **Simultaneous outbound connections are capped regardless of scale.**
   Unbounded opens exactly one connection per due monitor — 1,000, 2,500,
   5,000 as monitor count grows, unbounded. Bounded stays at the configured
   limit (50 here) no matter how many monitors are due. This is a direct,
   deterministic property (also covered by a unit test), not a benchmark
   artifact.
3. **Past ~1,000 monitors, unbounded's own latency and memory degrade while
   bounded's don't.** Unbounded p95 goes from 736 ms (1,000 monitors) to
   3,545 ms (2,500) to 4,048 ms (5,000) — a **5.5×** increase — while bounded
   stays at 502–508 ms throughout (flat, and near the mock's fixed 500 ms
   delay floor — close to the best case achievable against this target).
   Unbounded peak heap grows from 179.5 MB to 799.8 MB (**4.5×**) over the
   same range; bounded's grows from 127.8 MB to 198.1 MB (**1.5×**). Note
   unbounded is *still faster in raw checks/sec* than bounded at all three
   sizes tested here — the claim is about latency and memory stability, not
   throughput, at every scale actually measured.

## Calculated figures (as requested)

- **Throughput improvement (bounded default vs. original unbounded scheduler):** none at any
  tested size. −3.9% to −81.8% across 25–1,000 monitors (first table); still
  −59.4% to +38.8%¹ across 1,000–5,000 monitors (second table, sweep
  medians) — the sign flips only once memory pressure starts hurting
  unbounded (at 5,000 monitors bounded is 313.38 vs unbounded's 225.76
  checks/sec, **+38.8%**). Throughput improvement *does* exist relative to
  sequential polling: **+3,977%** (40.8×) at 1,000 monitors.
- **Scheduler-cycle reduction:** an *increase* of 4.1%–450.9% vs. the
  original unbounded scheduler across 25–1,000 monitors (first table) — not
  a reduction. Vs. sequential polling: a **97.5% reduction** (2,620.8 ms vs
  106,866.1 ms) at 1,000 monitors.
- **Maximum tested monitor count:** 5,000 (`concurrency-sweep.json`,
  `bounded-50`/`bounded-100`/`unbounded` at `monitorCount: 5000`). Sequential
  was capped at 1,000 by the sweep script itself — one 3-cycle sequential run
  at 5,000 monitors (15,000 checks) would take on the order of 27 minutes at
  the measured 9.36 checks/sec (15,000 ÷ 9.36 ≈ 1,603 sec), and repeating that
  3× was judged not worth the wall-clock cost for a configuration nobody
  would run in production.
- **Estimated checks/day at measured sustained throughput:** using the
  production-default configuration (bounded, concurrency 50) at the largest
  tested scale (5,000 monitors, median of 3 runs): **313.38 checks/sec ×
  86,400 sec/day ≈ 27,076,032 (≈27.1 million) checks/day.** This is a
  mechanical extrapolation of one measured number over a day, not a claim
  about sustained real-world load — see Limitations.

¹ Sweep medians: bounded(50) vs unbounded checks/sec — 1,000 monitors:
381.57 vs 939.97 (−59.4%); 2,500 monitors: 337.70 vs 260.50 (+29.6%); 5,000
monitors: 313.38 vs 225.76 (+38.8%).

## Limitations — what these numbers do not show

- **Single machine, single process.** No distributed workers, no multiple
  backend instances. The overlap guard (Commit 2) only prevents double-polling
  within one process.
- **Mock target, not real APIs.** The target responds in ~20 ms (healthy) or
  a fixed 500 ms (`/slow`), both far more predictable than real third-party
  latency and jitter. p95/p99 above are frequently pinned to that fixed delay,
  not a measure of scheduler overhead alone.
- **The 27.1M checks/day figure is not a load test.** It assumes the
  5,000-monitor, 3-cycle measured rate holds indefinitely; it does not
  account for database growth over time, connection pool exhaustion, or
  Postgres write throughput under sustained load, none of which were tested
  here.
- **Run-to-run variance is real,** especially ≥2,500 monitors — see the raw
  per-repeat data in `concurrency-sweep.json` (`results` array) rather than
  treating the medians as exact.
- **25/100/500/1,000-monitor numbers are single runs**, not medians —
  `baseline.json`/`optimized.json` were each run once to mirror how the
  original benchmark (Commit 1) was captured. Treat small differences (e.g.
  the 25-monitor row) as noise; only the sweep's median-of-3 figures should be
  treated as more than one data point.

## Source files

- `baseline.json` — original (unbounded) scheduler, 25/100/500/1,000 monitors.
- `optimized.json` — current (bounded, `POLL_CONCURRENCY=50`) scheduler, same sizes.
- `concurrency-sweep.json` — sequential, bounded(10/25/50/100), and unbounded, at 1,000/2,500/5,000 monitors, 3 repeats (1 for sequential).
