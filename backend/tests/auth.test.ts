import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../src/app'
import prisma from '../src/utils/prisma'

beforeEach(async () => {
  await prisma.user.deleteMany()
})

describe('POST /auth/register', () => {
  it('creates a user and returns a token', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'password123' })

    expect(res.status).toBe(201)
    expect(res.body.token).toEqual(expect.any(String))
    expect(res.body.user).toEqual({ id: expect.any(String), email: 'alice@example.com' })

    const stored = await prisma.user.findUnique({ where: { email: 'alice@example.com' } })
    expect(stored?.passwordHash).toBeDefined()
    expect(stored?.passwordHash).not.toBe('password123')
  })

  it('rejects a duplicate email with 409', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'password123' })

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'different123' })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EMAIL_TAKEN')
  })

  it('rejects an invalid payload with 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'password123' })
  })

  it('logs in with correct credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'alice@example.com', password: 'password123' })

    expect(res.status).toBe(200)
    expect(res.body.token).toEqual(expect.any(String))
    expect(res.body.user.email).toBe('alice@example.com')
  })

  it('rejects an incorrect password with 401', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'alice@example.com', password: 'wrong-password' })

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('rejects a nonexistent email with the same 401 as a wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' })

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })
})

describe('GET /auth/me', () => {
  it('rejects a request with no token', async () => {
    const res = await request(app).get('/auth/me')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('rejects a garbage token', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', 'Bearer not-a-real-token')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('returns the caller matching their own token', async () => {
    const register = await request(app)
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'password123' })

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${register.body.token}`)

    expect(res.status).toBe(200)
    expect(res.body.user).toEqual({ id: register.body.user.id, email: 'alice@example.com' })
  })

  it('never resolves one user token to another user, even when both exist', async () => {
    const alice = await request(app)
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'password123' })
    const bob = await request(app)
      .post('/auth/register')
      .send({ email: 'bob@example.com', password: 'password123' })

    const aliceMe = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${alice.body.token}`)
    const bobMe = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${bob.body.token}`)

    expect(aliceMe.body.user.email).toBe('alice@example.com')
    expect(bobMe.body.user.email).toBe('bob@example.com')
    expect(aliceMe.body.user.id).not.toBe(bobMe.body.user.id)
  })
})
