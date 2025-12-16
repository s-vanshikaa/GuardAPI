import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from './apiClient'

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed JSON on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ hello: 'world' }) }),
    )

    const result = await apiRequest<{ hello: string }>('/anything')
    expect(result).toEqual({ hello: 'world' })
  })

  it('throws an ApiError carrying the server error shape on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: { code: 'EMAIL_TAKEN', message: 'Email already registered' } }),
      }),
    )

    await expect(apiRequest('/auth/register')).rejects.toMatchObject({
      status: 409,
      code: 'EMAIL_TAKEN',
      message: 'Email already registered',
    })
  })

  it('throws a NETWORK_ERROR when the request itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(apiRequest('/anything')).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })

  it('sends the Authorization header when a token is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await apiRequest('/auth/me', { token: 'abc123' })

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ]
    expect(init.headers.Authorization).toBe('Bearer abc123')
  })
})
