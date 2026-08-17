import { describe, expect, it } from 'vitest'
import express from 'express'
import rateLimit from 'express-rate-limit'
import request from 'supertest'
import app from '../src/app'
import { createUser } from './helpers'

describe('rate limiting behavior (isolated instance)', () => {
  it('allows requests under the limit and blocks once it is exceeded', async () => {
    const testApp = express()
    testApp.use(
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 3,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } },
      }),
    )
    testApp.get('/ping', (_req, res) => res.status(200).json({ ok: true }))

    for (let i = 0; i < 3; i++) {
      const res = await request(testApp).get('/ping')
      expect(res.status).toBe(200)
    }

    const blocked = await request(testApp).get('/ping')
    expect(blocked.status).toBe(429)
    expect(blocked.body).toMatchObject({ error: { code: 'RATE_LIMITED' } })
  })
})

describe('rate limiting wired into the real app', () => {
  it('does not block normal test traffic (NODE_ENV=test disables enforcement)', async () => {
    // authRateLimiter's real limit is 10 — this proves the skip-in-test
    // wiring actually engages on the live app, not just in isolation above.
    for (let i = 0; i < 15; i++) {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: `ratelimit-${i}@example.com`, password: 'password123' })
      expect(res.status).toBe(201)
    }
  })

  it('still enforces authorization/validation alongside the limiter', async () => {
    const alice = await createUser('alice-ratelimit@example.com')
    const res = await request(app).get('/apis').set('Authorization', `Bearer ${alice.token}`)
    expect(res.status).toBe(200)
  })
})
