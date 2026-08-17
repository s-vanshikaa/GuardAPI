import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'
import { renderWithProviders } from '../testUtils'

const mockUseAuth = vi.fn()
vi.mock('../features/auth/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}))

function renderShell() {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<div>Page content</div>} />
      </Route>
    </Routes>,
    { route: '/' },
  )
}

describe('AppShell', () => {
  it("shows the signed-in user's email", () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', email: 'alice@example.com' },
      logout: vi.fn(),
    })

    renderShell()

    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
  })

  it('renders the routed page content via the layout outlet', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', email: 'alice@example.com' },
      logout: vi.fn(),
    })

    renderShell()

    expect(screen.getByText('Page content')).toBeInTheDocument()
  })

  it('logs out when the logout button is clicked', async () => {
    const logout = vi.fn()
    mockUseAuth.mockReturnValue({ user: { id: 'u1', email: 'alice@example.com' }, logout })

    renderShell()
    await userEvent.click(screen.getByRole('button', { name: /log out/i }))

    expect(logout).toHaveBeenCalledTimes(1)
  })
})
