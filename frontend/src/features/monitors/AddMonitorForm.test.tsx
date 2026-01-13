import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddMonitorForm } from './AddMonitorForm'
import { renderWithProviders } from '../../testUtils'
import { ApiError } from '../../services/apiClient'

const mockUseAuth = vi.fn()
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('./monitorsApi')
import { createMonitor } from './monitorsApi'

beforeEach(() => {
  mockUseAuth.mockReturnValue({
    token: 'test-token',
    user: { id: 'u1', email: 'alice@example.com' },
    logout: vi.fn(),
  })
})

describe('AddMonitorForm', () => {
  it('starts collapsed, showing only the Add Monitor button', () => {
    renderWithProviders(<AddMonitorForm />)

    expect(screen.getByRole('button', { name: /add monitor/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument()
  })

  it('opens the form on click and closes it again on cancel', async () => {
    renderWithProviders(<AddMonitorForm />)

    await userEvent.click(screen.getByRole('button', { name: /add monitor/i }))
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument()
  })

  it('submits the new monitor and collapses back to the button on success', async () => {
    vi.mocked(createMonitor).mockResolvedValue({
      id: 'm1',
      userId: 'u1',
      name: 'Stripe API',
      endpointUrl: 'https://api.stripe.com/health',
      description: null,
      expectedStatus: 200,
      pollIntervalMinutes: 5,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    renderWithProviders(<AddMonitorForm />)

    await userEvent.click(screen.getByRole('button', { name: /add monitor/i }))
    await userEvent.type(screen.getByLabelText(/name/i), 'Stripe API')
    await userEvent.type(screen.getByLabelText(/endpoint url/i), 'https://api.stripe.com/health')
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))

    expect(createMonitor).toHaveBeenCalledWith('test-token', {
      name: 'Stripe API',
      endpointUrl: 'https://api.stripe.com/health',
    })
    expect(await screen.findByRole('button', { name: /add monitor/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument()
  })

  it('shows the server error and keeps the form open when creation fails', async () => {
    vi.mocked(createMonitor).mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Endpoint URL must use http or https'),
    )
    renderWithProviders(<AddMonitorForm />)

    await userEvent.click(screen.getByRole('button', { name: /add monitor/i }))
    await userEvent.type(screen.getByLabelText(/name/i), 'Bad Monitor')
    await userEvent.type(screen.getByLabelText(/endpoint url/i), 'https://bad.example.com')
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Endpoint URL must use http or https')
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
  })

  it('disables the submit button while the request is in flight', async () => {
    vi.mocked(createMonitor).mockReturnValue(new Promise(() => {}))
    renderWithProviders(<AddMonitorForm />)

    await userEvent.click(screen.getByRole('button', { name: /add monitor/i }))
    await userEvent.type(screen.getByLabelText(/name/i), 'Stripe API')
    await userEvent.type(screen.getByLabelText(/endpoint url/i), 'https://api.stripe.com/health')
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))

    expect(await screen.findByRole('button', { name: /adding/i })).toBeDisabled()
  })
})
