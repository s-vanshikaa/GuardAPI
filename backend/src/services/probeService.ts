import dns from 'node:dns'
import net from 'node:net'
import axios, { type LookupAddress, type LookupAddressEntry } from 'axios'

export interface ProbeResult {
  success: boolean
  httpStatus: number | null
  latencyMs: number
  errorType: string | null
  responseData: unknown
}

export const SSRF_BLOCKED_CODE = 'ERR_GUARDAPI_BLOCKED_TARGET'

// Set only by vitest.config.mts — lets tests probe fake servers on loopback
// without disabling this check in real (non-test) environments. Read live
// (not cached at import) so tests can toggle it per-case with vi.stubEnv.
function privateTargetsAllowed(): boolean {
  return process.env.GUARDAPI_TEST_ALLOW_PRIVATE_TARGETS === 'true'
}

function isBlockedIPv4(ip: string): boolean {
  const octets = ip.split('.').map(Number)
  if (octets.length !== 4 || octets.some((o) => Number.isNaN(o))) return true
  const [a, b, c] = octets

  if (a === 0) return true // 0.0.0.0/8 — "this network"
  if (a === 10) return true // 10.0.0.0/8 — private
  if (a === 127) return true // 127.0.0.0/8 — loopback
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 — carrier-grade NAT
  if (a === 169 && b === 254) return true // 169.254.0.0/16 — link-local (cloud metadata lives here)
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12 — private
  if (a === 192 && b === 168) return true // 192.168.0.0/16 — private
  if (a === 192 && b === 0 && c === 0) return true // 192.0.0.0/24 — IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true // 192.0.2.0/24 — documentation
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/15 — benchmarking
  if (a === 198 && b === 51 && c === 100) return true // 198.51.100.0/24 — documentation
  if (a === 203 && b === 0 && c === 113) return true // 203.0.113.0/24 — documentation
  if (a >= 224) return true // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved, 255.255.255.255 broadcast

  return false
}

function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  if (normalized === '::1' || normalized === '::') return true // loopback / unspecified

  const mappedV4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mappedV4) return isBlockedIPv4(mappedV4[1])

  const firstHextet = normalized.split(':')[0]
  if (/^f[cd][0-9a-f]{0,2}$/.test(firstHextet)) return true // fc00::/7 — unique local
  if (/^fe[89ab][0-9a-f]?$/.test(firstHextet)) return true // fe80::/10 — link-local
  if (firstHextet.startsWith('ff')) return true // ff00::/8 — multicast

  return false
}

export function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIPv4(ip)
  if (net.isIPv6(ip)) return isBlockedIPv6(ip)
  return true // anything dns.lookup returns that isn't a recognizable IP — refuse it
}

function blockedTargetError(ip: string): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error(`Refusing to connect to a disallowed address (${ip})`)
  err.code = SSRF_BLOCKED_CODE
  return err
}

// A dns.lookup-compatible resolver (matches the signature Node's http/https
// request options expect) that refuses to connect to internal/reserved
// addresses. Passed as axios's `lookup` option, so it runs on every
// connection attempt — including each hop of a redirect — which is what
// closes off DNS-rebinding and redirect-based SSRF, not just a one-time
// check of the URL string the user submitted.
function safeLookup(
  hostname: string,
  options: { all?: boolean },
  callback: (err: Error | null, address: LookupAddress | LookupAddress[], family?: 4 | 6 | undefined) => void,
): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) {
      callback(err, '')
      return
    }

    const resolved: LookupAddressEntry[] = addresses.map((a) => ({
      address: a.address,
      family: a.family as 4 | 6 | undefined,
    }))
    const blocked = !privateTargetsAllowed() && resolved.find((a) => isBlockedAddress(a.address))
    if (blocked) {
      callback(blockedTargetError(blocked.address), '')
      return
    }

    if (options?.all) {
      callback(null, resolved)
    } else {
      callback(null, resolved[0].address, resolved[0].family as 4 | 6 | undefined)
    }
  })
}

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024 // caps memory use if a monitored endpoint returns a huge body

// Node skips the `lookup` hook entirely when the hostname is already a
// literal IP (nothing to resolve), so `lookup` alone never sees SSRF payloads
// like `http://169.254.169.254/...`. Every redirect hop gets a fresh check
// via `beforeRedirect`; this covers the first hop, which never goes through it.
function assertInitialTargetAllowed(rawUrl: string): void {
  if (privateTargetsAllowed()) return
  const hostname = new URL(rawUrl).hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(hostname) && isBlockedAddress(hostname)) {
    throw blockedTargetError(hostname)
  }
}

// Covers literal-IP redirect targets (e.g. a monitored endpoint 302s to
// http://169.254.169.254/...) — the same Node behavior that makes the initial
// pre-flight check necessary applies again at every redirect hop.
export function rejectBlockedRedirect(redirectOptions: Record<string, unknown>): void {
  if (privateTargetsAllowed()) return
  const hostname = String(redirectOptions.hostname ?? '').replace(/^\[|\]$/g, '')
  if (net.isIP(hostname) && isBlockedAddress(hostname)) {
    throw blockedTargetError(hostname)
  }
}

function classifyError(err: unknown): string {
  if (err instanceof Error && (err as NodeJS.ErrnoException).code === SSRF_BLOCKED_CODE) {
    return 'BLOCKED_ADDRESS'
  }
  if (axios.isAxiosError(err)) {
    if (err.code === SSRF_BLOCKED_CODE) return 'BLOCKED_ADDRESS'
    if (err.code === 'ECONNABORTED') return 'TIMEOUT'
    if (err.code === 'ECONNREFUSED') return 'CONNECTION_REFUSED'
    if (err.code === 'ENOTFOUND') return 'DNS_ERROR'
  }
  return 'NETWORK_ERROR'
}

export async function probeEndpoint(
  endpointUrl: string,
  expectedStatus: number,
  timeoutMs = 10_000,
): Promise<ProbeResult> {
  const startedAt = Date.now()

  try {
    assertInitialTargetAllowed(endpointUrl)

    const response = await axios.get(endpointUrl, {
      timeout: timeoutMs,
      validateStatus: () => true,
      maxRedirects: 5,
      maxContentLength: MAX_RESPONSE_BYTES,
      maxBodyLength: MAX_RESPONSE_BYTES,
      lookup: safeLookup,
      beforeRedirect: rejectBlockedRedirect,
      headers: { 'User-Agent': 'GuardAPI/1.0' },
    })

    return {
      success: response.status === expectedStatus,
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      errorType: response.status === expectedStatus ? null : 'UNEXPECTED_STATUS',
      responseData: response.data,
    }
  } catch (err) {
    return {
      success: false,
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      errorType: classifyError(err),
      responseData: null,
    }
  }
}
