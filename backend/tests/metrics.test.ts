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
      uptimePercentage: null,
      averageLatencyMs: null,
      p50LatencyMs: null,
      p95LatencyMs: null,
      p99LatencyMs: null,
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
    })
  })

  it('computes rolling metrics from a mix of successful and failed checks', async () => {
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
      uptimePercentage: 66.7,
      averageLatencyMs: 200,
      // 3 points {100, 200, 300}: p50 is the middle value, p95/p99
      // interpolate between 200 and 300 (continuous percentile).
      p50LatencyMs: 200,
      p95LatencyMs: 290,
      p99LatencyMs: 298,
      totalChecks: 3,
      successfulChecks: 2,
      failedChecks: 1,
    })
    expect(new Date(res.body.lastCheckedAt).getTime()).toBe(now - 1000)
  })

  it('excludes checks older than 24 hours from every rolling figure', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token)
    const now = Date.now()
    await prisma.monitorCheck.createMany({
      data: [
        // Just outside the window — must not affect any rolling figure.
        {
          apiId: monitor.id,
          success: false,
          httpStatus: 500,
          latencyMs: 9000,
          checkedAt: new Date(now - 25 * 60 * 60 * 1000),
        },
        // Inside the window.
        {
          apiId: monitor.id,
          success: true,
          httpStatus: 200,
          latencyMs: 120,
          checkedAt: new Date(now - 60 * 60 * 1000),
        },
      ],
    })

    const res = await request(app)
      .get(`/apis/${monitor.id}/metrics`)
      .set('Authorization', `Bearer ${alice.token}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      uptimePercentage: 100,
      averageLatencyMs: 120,
      p50LatencyMs: 120,
      p95LatencyMs: 120,
      p99LatencyMs: 120,
      totalChecks: 1,
      successfulChecks: 1,
      failedChecks: 0,
    })
  })

  it('reflects the latest check ever recorded even if it is outside the 24h window', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token)
    const staleCheckedAt = new Date(Date.now() - 48 * 60 * 60 * 1000)
    await prisma.monitorCheck.create({
      data: {
        apiId: monitor.id,
        success: false,
        httpStatus: 500,
        latencyMs: 50,
        checkedAt: staleCheckedAt,
      },
    })

    const res = await request(app)
      .get(`/apis/${monitor.id}/metrics`)
      .set('Authorization', `Bearer ${alice.token}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      currentHealth: 'down',
      latestHttpStatus: 500,
      latestLatencyMs: 50,
      // No checks in the last 24h, so the rolling figures are null/zero even
      // though a (stale) latest check exists.
      uptimePercentage: null,
      averageLatencyMs: null,
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
    })
    expect(new Date(res.body.lastCheckedAt).getTime()).toBe(staleCheckedAt.getTime())
  })

  it('ignores null latency values (failed connections) in the average and percentiles', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token)
    const now = Date.now()
    await prisma.monitorCheck.createMany({
      data: [
        {
          apiId: monitor.id,
          success: false,
          httpStatus: null,
          latencyMs: null,
          errorType: 'CONNECTION_REFUSED',
          checkedAt: new Date(now - 2000),
        },
        {
          apiId: monitor.id,
          success: true,
          httpStatus: 200,
          latencyMs: 100,
          checkedAt: new Date(now - 1000),
        },
      ],
    })

    const res = await request(app)
      .get(`/apis/${monitor.id}/metrics`)
      .set('Authorization', `Bearer ${alice.token}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      // Both checks still count toward totals/uptime...
      totalChecks: 2,
      successfulChecks: 1,
      failedChecks: 1,
      uptimePercentage: 50,
      // ...but only the one with a real latency feeds the latency figures.
      averageLatencyMs: 100,
      p50LatencyMs: 100,
      p95LatencyMs: 100,
      p99LatencyMs: 100,
    })
  })
})
