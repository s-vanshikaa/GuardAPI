import { afterEach, describe, expect, it } from 'vitest'
import type http from 'node:http'
import { probeEndpoint } from '../src/services/probeService'
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
