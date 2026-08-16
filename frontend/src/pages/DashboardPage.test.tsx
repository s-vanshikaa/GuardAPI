import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { DashboardPage } from './DashboardPage'
import { renderWithProviders } from '../testUtils'

const mockUseAuth = vi.fn()
vi.mock('../features/auth/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('../features/monitors/monitorsApi')
vi.mock('../features/incidents/incidentsApi')
import { listMonitors, getMonitorMetrics } from '../features/monitors/monitorsApi'
import { listIncidents } from '../features/incidents/incidentsApi'

beforeEach(() => {
  mockUseAuth.mockReturnValue({
    token: 'test-token',
    user: { id: '1', email: 'alice@example.com' },
    logout: vi.fn(),
  })
})

describe('DashboardPage', () => {
  it('shows a loading state while data is being fetched', () => {
    vi.mocked(listMonitors).mockReturnValue(new Promise(() => {}))
    vi.mocked(listIncidents).mockReturnValue(new Promise(() => {}))

    renderWithProviders(<DashboardPage />)

    expect(screen.getByText(/loading dashboard/i)).toBeInTheDocument()
  })

  it('shows an error message when monitors fail to load', async () => {
    vi.mocked(listMonitors).mockRejectedValue(new Error('Could not connect to the server.'))
    vi.mocked(listIncidents).mockResolvedValue([])

    renderWithProviders(<DashboardPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not connect to the server.')
  })

  it('shows an empty state when there are no monitors', async () => {
    vi.mocked(listMonitors).mockResolvedValue([])
    vi.mocked(listIncidents).mockResolvedValue([])

    renderWithProviders(<DashboardPage />)

    expect(await screen.findByText(/no apis yet/i)).toBeInTheDocument()
    expect(screen.getAllByText('0')).toHaveLength(3) // APIs, Healthy, Active Incidents
    expect(screen.getByText('—')).toBeInTheDocument() // Overall Uptime — nothing to average
    expect(screen.getByText(/no active incidents/i)).toBeInTheDocument()
  })

  it('displays monitor health, uptime, and active incidents', async () => {
    vi.mocked(listMonitors).mockResolvedValue([
      {
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
      },
    ])
    vi.mocked(getMonitorMetrics).mockResolvedValue({
      currentHealth: 'healthy',
      latestHttpStatus: 200,
      latestLatencyMs: 141,
      lastCheckedAt: new Date().toISOString(),
      averageLatencyMs: 150,
      uptimePercentage: 99.8,
      totalChecks: 100,
      failedChecks: 1,
    })
    vi.mocked(listIncidents).mockResolvedValue([
      {
        id: 'i1',
        apiId: 'm1',
        type: 'OUTAGE',
        severity: 'CRITICAL',
        status: 'OPEN',
        title: 'API is unreachable or failing',
        description: null,
        openedAt: new Date().toISOString(),
        resolvedAt: null,
      },
    ])

    renderWithProviders(<DashboardPage />)

    // "Stripe API" appears twice by design: once as the health table's row
    // link, and once as the incident row's affected-API label.
    expect(await screen.findAllByText('Stripe API')).toHaveLength(2)
    // 99.8% appears twice by design: the sole monitor's own uptime and the
    // dashboard-wide average (of one value) are legitimately the same number.
    expect(screen.getAllByText('99.8%')).toHaveLength(2)
    expect(screen.getByText('141ms')).toBeInTheDocument()
    expect(screen.getByText('API is unreachable or failing')).toBeInTheDocument()
    expect(screen.getByText('CRITICAL')).toBeInTheDocument()
  })
})
