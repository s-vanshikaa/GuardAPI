import { afterEach, describe, expect, it, vi } from 'vitest'
import type http from 'node:http'
import { probeEndpoint, isBlockedAddress, rejectBlockedRedirect } from '../src/services/probeService'
import { startTestServer } from './helpers'

let server: http.Server | undefined

afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server?.close(resolve))
    server = undefined
  }
})

describe('probeEndpoint', () => {
  it('reports success when the response matches the expected status', async () => {
    const started = startTestServer()
    server = started.server

    const result = await probeEndpoint(started.url, 200)

    expect(result.success).toBe(true)
    expect(result.httpStatus).toBe(200)
    expect(result.errorType).toBeNull()
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('reports failure when the response status does not match', async () => {
    const started = startTestServer((_req, res) => res.writeHead(500).end('error'))
    server = started.server

    const result = await probeEndpoint(started.url, 200)

    expect(result.success).toBe(false)
    expect(result.httpStatus).toBe(500)
    expect(result.errorType).toBe('UNEXPECTED_STATUS')
  })

  it('reports a connection failure when nothing is listening', async () => {
    const result = await probeEndpoint('http://127.0.0.1:1', 200, 1000)

    expect(result.success).toBe(false)
    expect(result.httpStatus).toBeNull()
    expect(result.errorType).toBe('CONNECTION_REFUSED')
  })

  it('reports a timeout when the response is too slow', async () => {
    const started = startTestServer((_req, res) => {
      setTimeout(() => res.writeHead(200).end('ok'), 200)
    })
    server = started.server

    const result = await probeEndpoint(started.url, 200, 50)

    expect(result.success).toBe(false)
    expect(result.httpStatus).toBeNull()
    expect(result.errorType).toBe('TIMEOUT')
  })
})

describe('isBlockedAddress (SSRF guard)', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['127.53.0.1', 'loopback range'],
    ['0.0.0.0', 'this-network'],
    ['10.0.0.5', 'private 10/8'],
    ['172.16.0.1', 'private 172.16/12 (low end)'],
    ['172.31.255.255', 'private 172.16/12 (high end)'],
    ['192.168.1.1', 'private 192.168/16'],
    ['169.254.169.254', 'link-local / cloud metadata'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['192.0.2.1', 'documentation range'],
    ['255.255.255.255', 'broadcast'],
    ['224.0.0.1', 'multicast'],
    ['::1', 'IPv6 loopback'],
    ['::', 'IPv6 unspecified'],
    ['fe80::1', 'IPv6 link-local'],
    ['fc00::1', 'IPv6 unique local'],
    ['::ffff:127.0.0.1', 'IPv4-mapped IPv6 loopback'],
    ['not-an-ip', 'unparseable input'],
  ])('blocks %s (%s)', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true)
  })

  it.each([
    ['8.8.8.8', 'public IPv4'],
    ['1.1.1.1', 'public IPv4'],
    ['2606:4700:4700::1111', 'public IPv6'],
  ])('allows %s (%s)', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false)
  })
})

describe('probeEndpoint SSRF protection', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('refuses to connect to a loopback target once the test bypass is disabled', async () => {
    const started = startTestServer()
    server = started.server
    vi.stubEnv('GUARDAPI_TEST_ALLOW_PRIVATE_TARGETS', 'false')

    const result = await probeEndpoint(started.url, 200)

    expect(result.success).toBe(false)
    expect(result.httpStatus).toBeNull()
    expect(result.errorType).toBe('BLOCKED_ADDRESS')
  })

  it('rejects a redirect hop that targets a blocked literal IP', () => {
    // A monitored endpoint 302ing to a raw internal IP is the classic SSRF
    // bypass: Node never calls the `lookup` hook for literal IPs, redirect
    // hops included, so this path needs its own check (rejectBlockedRedirect).
    vi.stubEnv('GUARDAPI_TEST_ALLOW_PRIVATE_TARGETS', 'false')

    expect(() => rejectBlockedRedirect({ hostname: '169.254.169.254' })).toThrow(
      /disallowed address/,
    )
  })

  it('allows a redirect hop that targets a public literal IP', () => {
    vi.stubEnv('GUARDAPI_TEST_ALLOW_PRIVATE_TARGETS', 'false')

    expect(() => rejectBlockedRedirect({ hostname: '8.8.8.8' })).not.toThrow()
  })
})
