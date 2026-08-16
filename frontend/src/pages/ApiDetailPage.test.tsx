import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { ApiDetailPage } from './ApiDetailPage'
import { renderWithProviders } from '../testUtils'

const mockUseAuth = vi.fn()
vi.mock('../features/auth/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('../features/monitors/monitorsApi')
vi.mock('../features/incidents/incidentsApi')
import { getMonitor, getMonitorChecks, getMonitorMetrics } from '../features/monitors/monitorsApi'
import { listIncidents } from '../features/incidents/incidentsApi'

function renderDetailRoute() {
  return renderWithProviders(
    <Routes>
      <Route path="/apis/:id" element={<ApiDetailPage />} />
    </Routes>,
    { route: '/apis/m1' },
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

const metrics = {
  currentHealth: 'healthy' as const,
  latestHttpStatus: 200,
  latestLatencyMs: 141,
  lastCheckedAt: new Date().toISOString(),
  averageLatencyMs: 150,
  uptimePercentage: 99.8,
  totalChecks: 2,
  failedChecks: 1,
}

const checks = [
  {
    id: 'c2',
    apiId: 'm1',
    checkedAt: '2026-01-01T00:01:00.000Z',
    success: true,
    httpStatus: 200,
    latencyMs: 141,
    errorType: null,
  },
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

beforeEach(() => {
  mockUseAuth.mockReturnValue({
    token: 'test-token',
    user: { id: 'u1', email: 'alice@example.com' },
    logout: vi.fn(),
  })
})

describe('ApiDetailPage', () => {
  it('shows a loading state while data is being fetched', () => {
    vi.mocked(getMonitor).mockReturnValue(new Promise(() => {}))
    vi.mocked(getMonitorMetrics).mockReturnValue(new Promise(() => {}))
    vi.mocked(getMonitorChecks).mockReturnValue(new Promise(() => {}))
    vi.mocked(listIncidents).mockReturnValue(new Promise(() => {}))

    renderDetailRoute()

    expect(screen.getByText(/loading api/i)).toBeInTheDocument()
  })

  it('shows an error message when the monitor fails to load', async () => {
    vi.mocked(getMonitor).mockRejectedValue(new Error('API monitor not found'))
    vi.mocked(getMonitorMetrics).mockReturnValue(new Promise(() => {}))
    vi.mocked(getMonitorChecks).mockReturnValue(new Promise(() => {}))
    vi.mocked(listIncidents).mockReturnValue(new Promise(() => {}))

    renderDetailRoute()

    expect(await screen.findByRole('alert')).toHaveTextContent('API monitor not found')
  })

  it('renders health, metrics, recent checks, incidents, and schema changes', async () => {
    vi.mocked(getMonitor).mockResolvedValue(monitor)
    vi.mocked(getMonitorMetrics).mockResolvedValue(metrics)
    vi.mocked(getMonitorChecks).mockResolvedValue(checks)
    vi.mocked(listIncidents).mockResolvedValue([
      {
        id: 'i1',
        apiId: 'm1',
        type: 'OUTAGE',
        severity: 'CRITICAL',
        status: 'OPEN',
        title: 'API is unreachable or failing',
        description: 'The endpoint responded with unexpected status 500.',
        openedAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      },
      {
        id: 'i2',
        apiId: 'm1',
        type: 'SCHEMA_CHANGE',
        severity: 'CRITICAL',
        status: 'OPEN',
        title: 'Breaking change detected — 1 field(s) removed',
        description: 'Field removed: profile.email (was string)',
        openedAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      },
    ])

    renderDetailRoute()

    expect(await screen.findByText('Stripe API')).toBeInTheDocument()
    expect(screen.getByText('https://api.stripe.com')).toBeInTheDocument()
    expect(screen.getByText('99.8%')).toBeInTheDocument()
    expect(screen.getByText('API is unreachable or failing')).toBeInTheDocument()
    expect(screen.getByText('Field removed: profile.email (was string)')).toBeInTheDocument()
    expect(screen.getAllByText('500')).toHaveLength(1)
  })

  it('shows an empty state for schema changes when there are none', async () => {
    vi.mocked(getMonitor).mockResolvedValue(monitor)
    vi.mocked(getMonitorMetrics).mockResolvedValue(metrics)
    vi.mocked(getMonitorChecks).mockResolvedValue([])
    vi.mocked(listIncidents).mockResolvedValue([])

    renderDetailRoute()

    expect(await screen.findByText(/no schema changes detected/i)).toBeInTheDocument()
    expect(screen.getByText(/no active incidents/i)).toBeInTheDocument()
    // "No monitoring checks yet." appears in both the chart and the table.
    expect(screen.getAllByText(/no monitoring checks yet/i)).toHaveLength(2)
  })
})
