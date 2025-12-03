import http from 'node:http'
import type { AddressInfo } from 'node:net'
import request from 'supertest'
import app from '../src/app'

const respondOk: http.RequestListener = (_req, res) => res.writeHead(200).end('ok')

export function startTestServer(handler: http.RequestListener = respondOk) {
  const server = http.createServer(handler)
  server.listen(0)
  const { port } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}`, server }
}

export async function createUser(email: string) {
  const res = await request(app).post('/auth/register').send({ email, password: 'password123' })
  return { token: res.body.token as string, userId: res.body.user.id as string }
}

export async function createMonitor(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/apis')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Example API', endpointUrl: 'https://api.example.com/health', ...overrides })
  return res.body
}
