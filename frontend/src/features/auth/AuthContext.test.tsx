import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuth } from './AuthContext'
import { renderWithProviders } from '../../testUtils'

vi.mock('./authApi')
import { fetchMe } from './authApi'

const TOKEN_STORAGE_KEY = 'guardapi_token'

function Probe() {
  const { token, user, isLoading, setSession, logout } = useAuth()
  return (
    <div>
      <span data-testid="token">{token ?? 'none'}</span>
      <span data-testid="user">{user?.email ?? 'none'}</span>
      <span data-testid="loading">{String(isLoading)}</span>
      <button onClick={() => setSession('new-token', { id: 'u2', email: 'new@example.com' })}>
        Login
      </button>
      <button onClick={logout}>Logout</button>
    </div>
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchMe).mockReset()
})

describe('AuthProvider', () => {
  it('starts logged out when there is no stored token', () => {
    renderWithProviders(<Probe />)

    expect(screen.getByTestId('token')).toHaveTextContent('none')
    expect(screen.getByTestId('user')).toHaveTextContent('none')
    expect(fetchMe).not.toHaveBeenCalled()
  })

  it('restores the session from a stored token by fetching the current user', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'stored-token')
    vi.mocked(fetchMe).mockResolvedValue({ user: { id: 'u1', email: 'alice@example.com' } })

    renderWithProviders(<Probe />)

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('alice@example.com'))
    expect(fetchMe).toHaveBeenCalledWith('stored-token')
  })

  // A stale/invalid token can never resolve to a user, so this must resolve
  // to a clean logged-out state rather than a stuck loading spinner forever.
  it('treats a failed session restore as logged out, not stuck loading', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'stale-token')
    vi.mocked(fetchMe).mockRejectedValue(new Error('Invalid or expired token'))

    renderWithProviders(<Probe />)

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('user')).toHaveTextContent('none')
  })

  it('setSession stores the token/user and updates the current session', async () => {
    // setSession seeds the ['me'] cache directly, but enabling the query
    // (token going from null to set) still triggers react-query's normal
    // refetch-on-enable, so fetchMe needs a resolved value here too.
    vi.mocked(fetchMe).mockResolvedValue({ user: { id: 'u2', email: 'new@example.com' } })
    renderWithProviders(<Probe />)

    await userEvent.click(screen.getByText('Login'))

    expect(screen.getByTestId('token')).toHaveTextContent('new-token')
    expect(screen.getByTestId('user')).toHaveTextContent('new@example.com')
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('new-token')
  })

  it('logout clears the in-memory session and the stored token', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'stored-token')
    vi.mocked(fetchMe).mockResolvedValue({ user: { id: 'u1', email: 'alice@example.com' } })
    renderWithProviders(<Probe />)
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('alice@example.com'))

    await userEvent.click(screen.getByText('Logout'))

    expect(screen.getByTestId('token')).toHaveTextContent('none')
    expect(screen.getByTestId('user')).toHaveTextContent('none')
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })
})
