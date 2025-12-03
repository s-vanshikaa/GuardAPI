import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../src/app'
import prisma from '../src/utils/prisma'
import { createUser, createMonitor } from './helpers'

beforeEach(async () => {
  await prisma.user.deleteMany()
})

describe('POST /apis', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app)
      .post('/apis')
      .send({ name: 'Example', endpointUrl: 'https://api.example.com' })
    expect(res.status).toBe(401)
  })

  it('creates a monitor owned by the caller', async () => {
    const { token, userId } = await createUser('alice@example.com')

    const res = await request(app)
      .post('/apis')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Example API', endpointUrl: 'https://api.example.com/health' })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      name: 'Example API',
      endpointUrl: 'https://api.example.com/health',
      userId,
      expectedStatus: 200,
      pollIntervalMinutes: 5,
      isActive: true,
    })
  })

  it('rejects a missing name with 400', async () => {
    const { token } = await createUser('alice@example.com')
    const res = await request(app)
      .post('/apis')
      .set('Authorization', `Bearer ${token}`)
      .send({ endpointUrl: 'https://api.example.com' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects a non-http(s) endpoint URL with 400', async () => {
    const { token } = await createUser('alice@example.com')
    const res = await request(app)
      .post('/apis')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Example', endpointUrl: 'ftp://api.example.com' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects a malformed endpoint URL with 400', async () => {
    const { token } = await createUser('alice@example.com')
    const res = await request(app)
      .post('/apis')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Example', endpointUrl: 'not-a-url' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('GET /apis', () => {
  it("only returns the caller's own monitors", async () => {
    const alice = await createUser('alice@example.com')
    const bob = await createUser('bob@example.com')
    await createMonitor(alice.token, { name: 'Alice API' })
    await createMonitor(bob.token, { name: 'Bob API' })

    const res = await request(app).get('/apis').set('Authorization', `Bearer ${alice.token}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].name).toBe('Alice API')
  })
})

describe('GET /apis/:id', () => {
  it('returns the monitor when owned by the caller', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token)

    const res = await request(app)
      .get(`/apis/${monitor.id}`)
      .set('Authorization', `Bearer ${alice.token}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(monitor.id)
  })

  it("returns 404 for another user's monitor", async () => {
    const alice = await createUser('alice@example.com')
    const bob = await createUser('bob@example.com')
    const monitor = await createMonitor(alice.token)

    const res = await request(app)
      .get(`/apis/${monitor.id}`)
      .set('Authorization', `Bearer ${bob.token}`)

    expect(res.status).toBe(404)
  })

  it('returns 404 for a nonexistent monitor', async () => {
    const alice = await createUser('alice@example.com')
    const res = await request(app)
      .get('/apis/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${alice.token}`)
    expect(res.status).toBe(404)
  })
})

describe('PATCH /apis/:id', () => {
  it('updates a monitor owned by the caller', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token)

    const res = await request(app)
      .patch(`/apis/${monitor.id}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ isActive: false })

    expect(res.status).toBe(200)
    expect(res.body.isActive).toBe(false)
  })

  it("rejects an update to another user's monitor with 404", async () => {
    const alice = await createUser('alice@example.com')
    const bob = await createUser('bob@example.com')
    const monitor = await createMonitor(alice.token)

    const res = await request(app)
      .patch(`/apis/${monitor.id}`)
      .set('Authorization', `Bearer ${bob.token}`)
      .send({ isActive: false })

    expect(res.status).toBe(404)

    const stillActive = await prisma.apiMonitor.findUnique({ where: { id: monitor.id } })
    expect(stillActive?.isActive).toBe(true)
  })
})

describe('DELETE /apis/:id', () => {
  it('deletes a monitor owned by the caller', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token)

    const res = await request(app)
      .delete(`/apis/${monitor.id}`)
      .set('Authorization', `Bearer ${alice.token}`)

    expect(res.status).toBe(204)
    const found = await prisma.apiMonitor.findUnique({ where: { id: monitor.id } })
    expect(found).toBeNull()
  })

  it("rejects deleting another user's monitor with 404", async () => {
    const alice = await createUser('alice@example.com')
    const bob = await createUser('bob@example.com')
    const monitor = await createMonitor(alice.token)

    const res = await request(app)
      .delete(`/apis/${monitor.id}`)
      .set('Authorization', `Bearer ${bob.token}`)

    expect(res.status).toBe(404)
    const stillThere = await prisma.apiMonitor.findUnique({ where: { id: monitor.id } })
    expect(stillThere).not.toBeNull()
  })
})
