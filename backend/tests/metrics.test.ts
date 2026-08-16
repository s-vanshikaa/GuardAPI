import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../src/app'
import prisma from '../src/utils/prisma'
import { createUser, createMonitor } from './helpers'

beforeEach(async () => {
  await prisma.user.deleteMany()
})

describe('GET /apis/:id/checks', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/apis/00000000-0000-0000-0000-000000000000/checks')
    expect(res.status).toBe(401)
  })

  it("returns 404 for another user's monitor", async () => {
    const alice = await createUser('alice@example.com')
    const bob = await createUser('bob@example.com')
    const monitor = await createMonitor(alice.token)

    const res = await request(app)
      .get(`/apis/${monitor.id}/checks`)
      .set('Authorization', `Bearer ${bob.token}`)

    expect(res.status).toBe(404)
  })

  it('returns checks newest first, respecting the limit', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token)
    const now = Date.now()
    await prisma.monitorCheck.createMany({
      data: [
        {
          apiId: monitor.id,
          success: true,
          httpStatus: 200,
          latencyMs: 10,
          checkedAt: new Date(now - 3000),
        },
        {
          apiId: monitor.id,
          success: true,
          httpStatus: 200,
          latencyMs: 20,
          checkedAt: new Date(now - 2000),
        },
        {
          apiId: monitor.id,
          success: false,
          httpStatus: 500,
          latencyMs: 30,
          checkedAt: new Date(now - 1000),
        },
      ],
    })

    const res = await request(app)
      .get(`/apis/${monitor.id}/checks?limit=2`)
      .set('Authorization', `Bearer ${alice.token}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0].latencyMs).toBe(30)
    expect(res.body[1].latencyMs).toBe(20)
  })
})

describe('GET /apis/:id/metrics', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/apis/00000000-0000-0000-0000-000000000000/metrics')
    expect(res.status).toBe(401)
  })

  it("returns 404 for another user's monitor", async () => {
    const alice = await createUser('alice@example.com')
    const bob = await createUser('bob@example.com')
    const monitor = await createMonitor(alice.token)

    const res = await request(app)
      .get(`/apis/${monitor.id}/metrics`)
      .set('Authorization', `Bearer ${bob.token}`)

    expect(res.status).toBe(404)
  })

  it('returns unknown/null metrics when there are no checks yet', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token)

    const res = await request(app)
      .get(`/apis/${monitor.id}/metrics`)
      .set('Authorization', `Bearer ${alice.token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      currentHealth: 'unknown',
      latestHttpStatus: null,
      latestLatencyMs: null,
      lastCheckedAt: null,
      averageLatencyMs: null,
      uptimePercentage: null,
      totalChecks: 0,
      failedChecks: 0,
    })
  })

  it('computes metrics from a mix of successful and failed checks', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token)
    const now = Date.now()
    await prisma.monitorCheck.createMany({
      data: [
        {
          apiId: monitor.id,
          success: true,
          httpStatus: 200,
          latencyMs: 100,
          checkedAt: new Date(now - 3000),
        },
        {
          apiId: monitor.id,
          success: true,
          httpStatus: 200,
          latencyMs: 200,
          checkedAt: new Date(now - 2000),
        },
        {
          apiId: monitor.id,
          success: false,
          httpStatus: 500,
          latencyMs: 300,
          errorType: 'UNEXPECTED_STATUS',
          checkedAt: new Date(now - 1000),
        },
      ],
    })

    const res = await request(app)
      .get(`/apis/${monitor.id}/metrics`)
      .set('Authorization', `Bearer ${alice.token}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      currentHealth: 'down',
      latestHttpStatus: 500,
      latestLatencyMs: 300,
      averageLatencyMs: 200,
      uptimePercentage: 66.7,
      totalChecks: 3,
      failedChecks: 1,
    })
    expect(new Date(res.body.lastCheckedAt).getTime()).toBe(now - 1000)
  })
})
