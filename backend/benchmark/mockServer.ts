// Deterministic local target for the GuardAPI benchmark. Runs in its own
// process (see runner.ts) so serving thousands of requests never shares an
// event loop with the scheduler being measured.
//
//   GET /healthy     200, small JSON body, fixed delay (MOCK_HEALTHY_DELAY_MS)
//   GET /slow        200, fixed delay (MOCK_SLOW_DELAY_MS, or ?delayMs=)
//   GET /error       500
//   GET /schema-v1   200, JSON body of shape A
//   GET /schema-v2   200, JSON body of shape B (field removed + type changed)
//   GET /__stats     request counts + peak concurrent in-flight requests
//   POST /__reset    zero the counters
import http from 'node:http'
import type { AddressInfo } from 'node:net'

export const SCHEMA_V1 = { id: 1, name: 'Alex', email: 'alex@example.com', plan: 'pro' }
// Drops `email` (breaking: CRITICAL) and turns `plan` into an object (structural).
export const SCHEMA_V2 = { id: 1, name: 'Alex', plan: { tier: 'pro' } }

function envMs(name: string, fallback: number): number {
  const raw = process.env[name]
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a number >= 0`)
  return value
}

const healthyDelayMs = envMs('MOCK_HEALTHY_DELAY_MS', 20)
const slowDelayMs = envMs('MOCK_SLOW_DELAY_MS', 500)

let requests = 0
let inFlight = 0
let peakInFlight = 0
const byPath: Record<string, number> = {}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
}

function respondAfter(delayMs: number, fn: () => void) {
  inFlight += 1
  peakInFlight = Math.max(peakInFlight, inFlight)
  setTimeout(() => {
    inFlight -= 1
    fn()
  }, delayMs)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')

  if (url.pathname === '/__stats') {
    return json(res, 200, { requests, peakInFlight, byPath })
  }
  if (url.pathname === '/__reset') {
    requests = 0
    peakInFlight = inFlight
    for (const key of Object.keys(byPath)) delete byPath[key]
    return json(res, 200, { ok: true })
  }

  requests += 1
  byPath[url.pathname] = (byPath[url.pathname] ?? 0) + 1

  switch (url.pathname) {
    case '/healthy':
      return respondAfter(healthyDelayMs, () => json(res, 200, { status: 'ok' }))
    case '/slow': {
      const delayMs = Number(url.searchParams.get('delayMs') ?? slowDelayMs)
      return respondAfter(Number.isFinite(delayMs) ? delayMs : slowDelayMs, () =>
        json(res, 200, { status: 'ok', slow: true }),
      )
    }
    case '/error':
      return respondAfter(healthyDelayMs, () => json(res, 500, { error: 'benchmark error' }))
    case '/schema-v1':
      return respondAfter(healthyDelayMs, () => json(res, 200, SCHEMA_V1))
    case '/schema-v2':
      return respondAfter(healthyDelayMs, () => json(res, 200, SCHEMA_V2))
    default:
      return json(res, 404, { error: 'not found' })
  }
})

server.listen(Number(process.env.MOCK_PORT ?? 0), '127.0.0.1', () => {
  const { port } = server.address() as AddressInfo
  // The runner reads this line to learn the port.
  console.log(`MOCK_LISTENING ${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
