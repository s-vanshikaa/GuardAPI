import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { renderWithProviders } from '../../testUtils'

const mockUseAuth = vi.fn()
vi.mock('./AuthContext', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}))

function renderProtected() {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<div>Login page</div>} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<div>Protected content</div>} />
      </Route>
    </Routes>,
    { route: '/' },
  )
}

describe('ProtectedRoute', () => {
  it('redirects to /login when there is no session', () => {
    mockUseAuth.mockReturnValue({ token: null, user: null, isLoading: false })
    renderProtected()
    expect(screen.getByText('Login page')).toBeInTheDocument()
  })

  it('shows a loading state while the session is being verified', () => {
    mockUseAuth.mockReturnValue({ token: 't', user: null, isLoading: true })
    renderProtected()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders the protected content when authenticated', () => {
    mockUseAuth.mockReturnValue({
      token: 't',
      user: { id: '1', email: 'a@b.com' },
      isLoading: false,
    })
    renderProtected()
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })
})
