import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type http from 'node:http'
import request from 'supertest'
import app from '../src/app'
import prisma from '../src/utils/prisma'
import { pollDueMonitors } from '../src/jobs/scheduler'
import { createUser, createMonitor, startTestServer } from './helpers'

beforeEach(async () => {
  await prisma.user.deleteMany()
})

let server: http.Server | undefined

afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server?.close(resolve))
    server = undefined
  }
})

function startServer(): string {
  const started = startTestServer()
  server = started.server
  return started.url
}

describe('POST /apis/:id/poll', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/apis/00000000-0000-0000-0000-000000000000/poll')
    expect(res.status).toBe(401)
  })

  it('probes the endpoint and persists a MonitorCheck', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token, { endpointUrl: startServer() })

    const res = await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ apiId: monitor.id, success: true, httpStatus: 200 })

    const checks = await prisma.monitorCheck.findMany({ where: { apiId: monitor.id } })
    expect(checks).toHaveLength(1)
  })

  it("rejects polling another user's monitor with 404", async () => {
    const alice = await createUser('alice@example.com')
    const bob = await createUser('bob@example.com')
    const monitor = await createMonitor(alice.token)

    const res = await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${bob.token}`)

    expect(res.status).toBe(404)
  })
})

describe('pollDueMonitors', () => {
  it('probes a monitor that has never been checked', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token, { endpointUrl: startServer() })

    await pollDueMonitors()

    const checks = await prisma.monitorCheck.findMany({ where: { apiId: monitor.id } })
    expect(checks).toHaveLength(1)
  })

  it('skips a monitor whose interval has not elapsed', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token, { pollIntervalMinutes: 60 })
    await prisma.monitorCheck.create({
      data: { apiId: monitor.id, success: true, httpStatus: 200, latencyMs: 10 },
    })

    await pollDueMonitors()

    const checks = await prisma.monitorCheck.findMany({ where: { apiId: monitor.id } })
    expect(checks).toHaveLength(1)
  })

  it('probes a monitor whose interval has elapsed', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token, {
      pollIntervalMinutes: 1,
      endpointUrl: startServer(),
    })
    const twoMinutesAgo = new Date(Date.now() - 2 * 60_000)
    await prisma.monitorCheck.create({
      data: {
        apiId: monitor.id,
        success: true,
        httpStatus: 200,
        latencyMs: 10,
        checkedAt: twoMinutesAgo,
      },
    })

    await pollDueMonitors()

    const checks = await prisma.monitorCheck.findMany({ where: { apiId: monitor.id } })
    expect(checks).toHaveLength(2)
  })

  it('never probes an inactive monitor', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token, { isActive: false })

    await pollDueMonitors()

    const checks = await prisma.monitorCheck.findMany({ where: { apiId: monitor.id } })
    expect(checks).toHaveLength(0)
  })
})
