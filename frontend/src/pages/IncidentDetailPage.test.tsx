import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { IncidentDetailPage } from './IncidentDetailPage'
import { renderWithProviders } from '../testUtils'

const mockUseAuth = vi.fn()
vi.mock('../features/auth/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('../features/monitors/monitorsApi')
vi.mock('../features/incidents/incidentsApi')
import { getMonitor, getMonitorChecks } from '../features/monitors/monitorsApi'
import { acknowledgeIncident, getIncident, resolveIncident } from '../features/incidents/incidentsApi'

function renderDetailRoute() {
  return renderWithProviders(
    <Routes>
      <Route path="/incidents/:id" element={<IncidentDetailPage />} />
    </Routes>,
    { route: '/incidents/i1' },
  )
}

const monitor = {
  id: 'm1',
  userId: 'u1',
  name: 'Stripe API',
  endpointUrl: 'https://api.stripe.com',
  description: null,
  expectedStatus: 200,
  pollIntervalMinutes: 5,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const checks = [
  {
    id: 'c1',
    apiId: 'm1',
    checkedAt: '2026-01-01T00:00:00.000Z',
    success: false,
    httpStatus: 500,
    latencyMs: 883,
    errorType: null,
  },
]

const outageIncident = {
  id: 'i1',
  apiId: 'm1',
  type: 'OUTAGE' as const,
  severity: 'CRITICAL' as const,
  status: 'OPEN' as const,
  title: 'API is unreachable or failing',
  description: 'The endpoint responded with unexpected status 500.',
  openedAt: '2026-01-01T00:00:00.000Z',
  resolvedAt: null,
}

const schemaIncident = {
  id: 'i2',
  apiId: 'm1',
  type: 'SCHEMA_CHANGE' as const,
  severity: 'CRITICAL' as const,
  status: 'ACKNOWLEDGED' as const,
  title: 'Breaking change detected — 1 field(s) removed',
  description: 'Field removed: profile.email (was string)',
  openedAt: '2026-01-01T00:00:00.000Z',
  resolvedAt: null,
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({
    token: 'test-token',
    user: { id: 'u1', email: 'alice@example.com' },
    logout: vi.fn(),
  })
  vi.mocked(getMonitor).mockResolvedValue(monitor)
  vi.mocked(getMonitorChecks).mockResolvedValue(checks)
})

describe('IncidentDetailPage', () => {
  it('shows a loading state while the incident is being fetched', () => {
    vi.mocked(getIncident).mockReturnValue(new Promise(() => {}))

    renderDetailRoute()

    expect(screen.getByText(/loading incident/i)).toBeInTheDocument()
  })

  it('shows an error message when the incident fails to load', async () => {
    vi.mocked(getIncident).mockRejectedValue(new Error('Incident not found'))

    renderDetailRoute()

    expect(await screen.findByRole('alert')).toHaveTextContent('Incident not found')
  })

  it('renders an open outage incident with its summary, checks, and both actions', async () => {
    vi.mocked(getIncident).mockResolvedValue(outageIncident)

    renderDetailRoute()

    expect(await screen.findByText('API is unreachable or failing')).toBeInTheDocument()
    expect(screen.getByText('CRITICAL')).toBeInTheDocument()
    expect(screen.getByText('OPEN')).toBeInTheDocument()
    expect(await screen.findByText('Stripe API')).toBeInTheDocument()
    expect(screen.getByText('The endpoint responded with unexpected status 500.')).toBeInTheDocument()
    expect(await screen.findByText('500')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /acknowledge/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /resolve/i })).toBeInTheDocument()
  })

  it('renders the schema diff for a schema-change incident without an Acknowledge action', async () => {
    vi.mocked(getIncident).mockResolvedValue(schemaIncident)

    renderDetailRoute()

    expect(await screen.findByText('Field removed: profile.email (was string)')).toBeInTheDocument()
    expect(screen.getByText('ACKNOWLEDGED')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /acknowledge/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /resolve/i })).toBeInTheDocument()
  })

  it('acknowledges an open incident', async () => {
    vi.mocked(getIncident).mockResolvedValue(outageIncident)
    vi.mocked(acknowledgeIncident).mockResolvedValue({ ...outageIncident, status: 'ACKNOWLEDGED' })

    renderDetailRoute()

    await userEvent.click(await screen.findByRole('button', { name: /acknowledge/i }))

    expect(acknowledgeIncident).toHaveBeenCalledWith('test-token', 'i1')
    expect(await screen.findByText('ACKNOWLEDGED')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /acknowledge/i })).not.toBeInTheDocument()
  })

  it('resolves an incident and hides the actions afterward', async () => {
    vi.mocked(getIncident).mockResolvedValue(outageIncident)
    vi.mocked(resolveIncident).mockResolvedValue({
      ...outageIncident,
      status: 'RESOLVED',
      resolvedAt: '2026-01-01T00:05:00.000Z',
    })

    renderDetailRoute()

    await userEvent.click(await screen.findByRole('button', { name: /resolve/i }))

    expect(resolveIncident).toHaveBeenCalledWith('test-token', 'i1')
    expect(await screen.findByText(/this incident was resolved/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /acknowledge/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /resolve/i })).not.toBeInTheDocument()
  })

  it('shows no actions for an already-resolved incident', async () => {
    vi.mocked(getIncident).mockResolvedValue({
      ...outageIncident,
      status: 'RESOLVED',
      resolvedAt: '2026-01-01T00:05:00.000Z',
    })

    renderDetailRoute()

    expect(await screen.findByText(/this incident was resolved/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /acknowledge/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /resolve/i })).not.toBeInTheDocument()
  })
})
