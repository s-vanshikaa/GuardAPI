import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type http from 'node:http'
import request from 'supertest'
import app from '../src/app'
import prisma from '../src/utils/prisma'
import { createUser, createMonitor, startTestServer } from './helpers'

vi.mock('../src/services/emailService', () => ({
  sendIncidentEmail: vi.fn().mockResolvedValue(undefined),
}))
import { sendIncidentEmail } from '../src/services/emailService'
const sendIncidentEmailMock = vi.mocked(sendIncidentEmail)

beforeEach(async () => {
  await prisma.user.deleteMany()
  sendIncidentEmailMock.mockClear()
})

let server: http.Server | undefined

afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server?.close(resolve))
    server = undefined
  }
})

describe('incident creation from monitoring failures', () => {
  it('opens a CRITICAL outage incident on a failed check', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token, { endpointUrl: 'http://127.0.0.1:1' })

    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)

    const incidents = await prisma.incident.findMany({ where: { apiId: monitor.id } })
    expect(incidents).toHaveLength(1)
    expect(incidents[0]).toMatchObject({ type: 'OUTAGE', severity: 'CRITICAL', status: 'OPEN' })
  })

  it('does not open a second outage incident while one is already open', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token, { endpointUrl: 'http://127.0.0.1:1' })

    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)
    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)

    const incidents = await prisma.incident.findMany({ where: { apiId: monitor.id } })
    expect(incidents).toHaveLength(1)
  })

  it('resolves the open outage incident once the endpoint recovers', async () => {
    const alice = await createUser('alice@example.com')
    let healthy = false
    const started = startTestServer((_req, res) => {
      res.writeHead(healthy ? 200 : 500).end('body')
    })
    server = started.server
    const monitor = await createMonitor(alice.token, { endpointUrl: started.url })

    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)
    healthy = true
    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)

    const incidents = await prisma.incident.findMany({ where: { apiId: monitor.id } })
    expect(incidents).toHaveLength(1)
    expect(incidents[0].status).toBe('RESOLVED')
    expect(incidents[0].resolvedAt).not.toBeNull()
  })
})

describe('incident creation from schema changes', () => {
  it('does not open an incident for the initial baseline snapshot', async () => {
    const alice = await createUser('alice@example.com')
    const started = startTestServer((_req, res) => {
      res
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ id: 1, name: 'Alex' }))
    })
    server = started.server
    const monitor = await createMonitor(alice.token, { endpointUrl: started.url })

    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)

    const incidents = await prisma.incident.findMany({ where: { apiId: monitor.id } })
    expect(incidents).toHaveLength(0)
  })

  it('does not open an incident for a purely additive (INFO) change', async () => {
    const alice = await createUser('alice@example.com')
    let withAvatar = false
    const started = startTestServer((_req, res) => {
      const body = withAvatar ? { id: 1, name: 'Alex', avatar: 'url' } : { id: 1, name: 'Alex' }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
    })
    server = started.server
    const monitor = await createMonitor(alice.token, { endpointUrl: started.url })

    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)
    withAvatar = true
    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)

    const incidents = await prisma.incident.findMany({ where: { apiId: monitor.id } })
    expect(incidents).toHaveLength(0)
  })

  it('opens a CRITICAL incident when a field is removed', async () => {
    const alice = await createUser('alice@example.com')
    let removeEmail = false
    const started = startTestServer((_req, res) => {
      const body = removeEmail ? { id: 1 } : { id: 1, email: 'a@b.com' }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
    })
    server = started.server
    const monitor = await createMonitor(alice.token, { endpointUrl: started.url })

    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)
    removeEmail = true
    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)

    const incidents = await prisma.incident.findMany({ where: { apiId: monitor.id } })
    expect(incidents).toHaveLength(1)
    expect(incidents[0]).toMatchObject({
      type: 'SCHEMA_CHANGE',
      severity: 'CRITICAL',
      status: 'OPEN',
    })
  })

  it('does not open a second schema-change incident while one is already open', async () => {
    const alice = await createUser('alice@example.com')
    let step = 0
    const bodies = [{ id: 1, email: 'a@b.com' }, { id: 1 }, {}]
    const started = startTestServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(bodies[step]))
    })
    server = started.server
    const monitor = await createMonitor(alice.token, { endpointUrl: started.url })

    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)
    step = 1
    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)
    step = 2
    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)

    const incidents = await prisma.incident.findMany({ where: { apiId: monitor.id } })
    expect(incidents).toHaveLength(1)
  })
})

describe('email notifications for CRITICAL incidents', () => {
  it('sends exactly one email when an outage incident opens', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token, { endpointUrl: 'http://127.0.0.1:1' })

    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)

    expect(sendIncidentEmailMock).toHaveBeenCalledTimes(1)
    expect(sendIncidentEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@example.com',
        apiMonitor: expect.objectContaining({ id: monitor.id }),
        incident: expect.objectContaining({ type: 'OUTAGE', severity: 'CRITICAL' }),
      }),
    )
  })

  it('does not send a repeat email while the outage incident stays open', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token, { endpointUrl: 'http://127.0.0.1:1' })

    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)
    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)

    expect(sendIncidentEmailMock).toHaveBeenCalledTimes(1)
  })

  it('sends an email for a CRITICAL schema change (field removed)', async () => {
    const alice = await createUser('alice@example.com')
    let removeEmail = false
    const started = startTestServer((_req, res) => {
      const body = removeEmail ? { id: 1 } : { id: 1, email: 'a@b.com' }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
    })
    server = started.server
    const monitor = await createMonitor(alice.token, { endpointUrl: started.url })

    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)
    removeEmail = true
    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)

    expect(sendIncidentEmailMock).toHaveBeenCalledTimes(1)
    expect(sendIncidentEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@example.com',
        incident: expect.objectContaining({ type: 'SCHEMA_CHANGE', severity: 'CRITICAL' }),
      }),
    )
  })

  it('does not send an email for a WARNING (type-changed) schema change', async () => {
    const alice = await createUser('alice@example.com')
    let stringId = false
    const started = startTestServer((_req, res) => {
      const body = stringId ? { id: '1' } : { id: 1 }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
    })
    server = started.server
    const monitor = await createMonitor(alice.token, { endpointUrl: started.url })

    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)
    stringId = true
    await request(app)
      .post(`/apis/${monitor.id}/poll`)
      .set('Authorization', `Bearer ${alice.token}`)

    const incidents = await prisma.incident.findMany({ where: { apiId: monitor.id } })
    expect(incidents[0]).toMatchObject({ severity: 'WARNING' })
    expect(sendIncidentEmailMock).not.toHaveBeenCalled()
  })
})

describe('GET /incidents', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/incidents')
    expect(res.status).toBe(401)
  })

  it("only returns the caller's own incidents", async () => {
    const alice = await createUser('alice@example.com')
    const bob = await createUser('bob@example.com')
    const aliceMonitor = await createMonitor(alice.token)
    const bobMonitor = await createMonitor(bob.token)
    await prisma.incident.create({
      data: {
        apiId: aliceMonitor.id,
        type: 'OUTAGE',
        severity: 'CRITICAL',
        title: 'alice incident',
      },
    })
    await prisma.incident.create({
      data: { apiId: bobMonitor.id, type: 'OUTAGE', severity: 'CRITICAL', title: 'bob incident' },
    })

    const res = await request(app).get('/incidents').set('Authorization', `Bearer ${alice.token}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].title).toBe('alice incident')
  })

  it('filters by apiId', async () => {
    const alice = await createUser('alice@example.com')
    const m1 = await createMonitor(alice.token, { name: 'M1' })
    const m2 = await createMonitor(alice.token, { name: 'M2' })
    await prisma.incident.create({
      data: { apiId: m1.id, type: 'OUTAGE', severity: 'CRITICAL', title: 'm1 incident' },
    })
    await prisma.incident.create({
      data: { apiId: m2.id, type: 'OUTAGE', severity: 'CRITICAL', title: 'm2 incident' },
    })

    const res = await request(app)
      .get(`/incidents?apiId=${m1.id}`)
      .set('Authorization', `Bearer ${alice.token}`)

    expect(res.body).toHaveLength(1)
    expect(res.body[0].title).toBe('m1 incident')
  })

  it('filters by status', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token)
    await prisma.incident.create({
      data: { apiId: monitor.id, type: 'OUTAGE', severity: 'CRITICAL', title: 'open one' },
    })
    await prisma.incident.create({
      data: {
        apiId: monitor.id,
        type: 'OUTAGE',
        severity: 'CRITICAL',
        title: 'resolved one',
        status: 'RESOLVED',
        resolvedAt: new Date(),
      },
    })

    const res = await request(app)
      .get('/incidents?status=RESOLVED')
      .set('Authorization', `Bearer ${alice.token}`)

    expect(res.body).toHaveLength(1)
    expect(res.body[0].title).toBe('resolved one')
  })
})

describe('GET /incidents/:id', () => {
  it("returns 404 for another user's incident", async () => {
    const alice = await createUser('alice@example.com')
    const bob = await createUser('bob@example.com')
    const monitor = await createMonitor(alice.token)
    const incident = await prisma.incident.create({
      data: { apiId: monitor.id, type: 'OUTAGE', severity: 'CRITICAL', title: 'x' },
    })

    const res = await request(app)
      .get(`/incidents/${incident.id}`)
      .set('Authorization', `Bearer ${bob.token}`)

    expect(res.status).toBe(404)
  })

  it('returns the incident when owned', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token)
    const incident = await prisma.incident.create({
      data: { apiId: monitor.id, type: 'OUTAGE', severity: 'CRITICAL', title: 'x' },
    })

    const res = await request(app)
      .get(`/incidents/${incident.id}`)
      .set('Authorization', `Bearer ${alice.token}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(incident.id)
  })
})

describe('POST /incidents/:id/acknowledge', () => {
  it('transitions an open incident to acknowledged', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token)
    const incident = await prisma.incident.create({
      data: { apiId: monitor.id, type: 'OUTAGE', severity: 'CRITICAL', title: 'x' },
    })

    const res = await request(app)
      .post(`/incidents/${incident.id}/acknowledge`)
      .set('Authorization', `Bearer ${alice.token}`)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ACKNOWLEDGED')
  })

  it('rejects acknowledging an already-acknowledged incident', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token)
    const incident = await prisma.incident.create({
      data: {
        apiId: monitor.id,
        type: 'OUTAGE',
        severity: 'CRITICAL',
        title: 'x',
        status: 'ACKNOWLEDGED',
      },
    })

    const res = await request(app)
      .post(`/incidents/${incident.id}/acknowledge`)
      .set('Authorization', `Bearer ${alice.token}`)

    expect(res.status).toBe(400)
  })

  it("rejects acknowledging another user's incident with 404", async () => {
    const alice = await createUser('alice@example.com')
    const bob = await createUser('bob@example.com')
    const monitor = await createMonitor(alice.token)
    const incident = await prisma.incident.create({
      data: { apiId: monitor.id, type: 'OUTAGE', severity: 'CRITICAL', title: 'x' },
    })

    const res = await request(app)
      .post(`/incidents/${incident.id}/acknowledge`)
      .set('Authorization', `Bearer ${bob.token}`)

    expect(res.status).toBe(404)
  })
})

describe('POST /incidents/:id/resolve', () => {
  it('resolves an open incident directly', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token)
    const incident = await prisma.incident.create({
      data: { apiId: monitor.id, type: 'OUTAGE', severity: 'CRITICAL', title: 'x' },
    })

    const res = await request(app)
      .post(`/incidents/${incident.id}/resolve`)
      .set('Authorization', `Bearer ${alice.token}`)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('RESOLVED')
    expect(res.body.resolvedAt).not.toBeNull()
  })

  it('resolves an acknowledged incident', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token)
    const incident = await prisma.incident.create({
      data: {
        apiId: monitor.id,
        type: 'OUTAGE',
        severity: 'CRITICAL',
        title: 'x',
        status: 'ACKNOWLEDGED',
      },
    })

    const res = await request(app)
      .post(`/incidents/${incident.id}/resolve`)
      .set('Authorization', `Bearer ${alice.token}`)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('RESOLVED')
  })

  it('rejects resolving an already-resolved incident', async () => {
    const alice = await createUser('alice@example.com')
    const monitor = await createMonitor(alice.token)
    const incident = await prisma.incident.create({
      data: {
        apiId: monitor.id,
        type: 'OUTAGE',
        severity: 'CRITICAL',
        title: 'x',
        status: 'RESOLVED',
        resolvedAt: new Date(),
      },
    })

    const res = await request(app)
      .post(`/incidents/${incident.id}/resolve`)
      .set('Authorization', `Bearer ${alice.token}`)

    expect(res.status).toBe(400)
  })

  it("rejects resolving another user's incident with 404", async () => {
    const alice = await createUser('alice@example.com')
    const bob = await createUser('bob@example.com')
    const monitor = await createMonitor(alice.token)
    const incident = await prisma.incident.create({
      data: { apiId: monitor.id, type: 'OUTAGE', severity: 'CRITICAL', title: 'x' },
    })

    const res = await request(app)
      .post(`/incidents/${incident.id}/resolve`)
      .set('Authorization', `Bearer ${bob.token}`)

    expect(res.status).toBe(404)
  })
})
