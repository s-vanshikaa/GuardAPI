import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { LoginPage } from './LoginPage'
import { renderWithProviders } from '../testUtils'
import { ApiError } from '../services/apiClient'

vi.mock('../features/auth/authApi')
import { loginRequest } from '../features/auth/authApi'

function renderLoginRoute() {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<div>Dashboard placeholder</div>} />
    </Routes>,
    { route: '/login' },
  )
}

describe('LoginPage', () => {
  it('logs in and redirects to the protected home on success', async () => {
    vi.mocked(loginRequest).mockResolvedValue({ token: 't', user: { id: '1', email: 'a@b.com' } })
    renderLoginRoute()

    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Dashboard placeholder')).toBeInTheDocument()
  })

  it('shows the server error message on invalid credentials', async () => {
    vi.mocked(loginRequest).mockRejectedValue(
      new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials'),
    )
    renderLoginRoute()

    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials')
  })

  it('disables the submit button while the request is in flight', async () => {
    vi.mocked(loginRequest).mockReturnValue(new Promise(() => {}))
    renderLoginRoute()

    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('button', { name: /signing in/i })).toBeDisabled()
  })
})
