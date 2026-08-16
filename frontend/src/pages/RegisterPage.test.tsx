import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { RegisterPage } from './RegisterPage'
import { renderWithProviders } from '../testUtils'
import { ApiError } from '../services/apiClient'

vi.mock('../features/auth/authApi')
import { registerRequest } from '../features/auth/authApi'

function renderRegisterRoute() {
  return renderWithProviders(
    <Routes>
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<div>Dashboard placeholder</div>} />
    </Routes>,
    { route: '/register' },
  )
}

describe('RegisterPage', () => {
  it('registers and redirects to the protected home on success', async () => {
    vi.mocked(registerRequest).mockResolvedValue({
      token: 't',
      user: { id: '1', email: 'a@b.com' },
    })
    renderRegisterRoute()

    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText('Dashboard placeholder')).toBeInTheDocument()
  })

  it('shows the server error message for a duplicate account', async () => {
    vi.mocked(registerRequest).mockRejectedValue(
      new ApiError(409, 'EMAIL_TAKEN', 'Email already registered'),
    )
    renderRegisterRoute()

    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Email already registered')
  })
})
