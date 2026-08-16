import { useQueries, useQuery } from '@tanstack/react-query'
import { useAuth } from '../features/auth/AuthContext'
import { listMonitors, getMonitorMetrics } from '../features/monitors/monitorsApi'
import { listIncidents } from '../features/incidents/incidentsApi'
import { PageHeader } from '../components/PageHeader'
import { ActiveIncidentsList } from '../features/incidents/ActiveIncidentsList'
import { ApiHealthTable } from '../features/monitors/ApiHealthTable'
import type { ApiHealthRow } from '../features/monitors/ApiHealthTable'
import { AddMonitorForm } from '../features/monitors/AddMonitorForm'
import './DashboardPage.css'

export function DashboardPage() {
  const { token } = useAuth()

  const monitorsQuery = useQuery({
    queryKey: ['monitors'],
    queryFn: () => listMonitors(token as string),
  })

  const incidentsQuery = useQuery({
    queryKey: ['incidents'],
    queryFn: () => listIncidents(token as string),
  })

  const monitors = monitorsQuery.data ?? []

  const metricsQueries = useQueries({
    queries: monitors.map((monitor) => ({
      queryKey: ['monitorMetrics', monitor.id],
      queryFn: () => getMonitorMetrics(token as string, monitor.id),
      enabled: monitorsQuery.isSuccess,
    })),
  })

  if (monitorsQuery.isPending || incidentsQuery.isPending) {
    return (
      <div className="dashboard-page">
        <PageHeader
          title="Overview"
          description="Monitor health and breaking API changes."
          action={<AddMonitorForm />}
        />
        <p className="loading-caption">Loading dashboard…</p>
        <div className="health-strip health-strip--loading">
          <span className="skeleton skeleton-line" />
        </div>
        <div className="dashboard-section">
          <span className="section-heading">Active Incidents</span>
          <div className="skeleton-list">
            <span className="skeleton skeleton-line" />
          </div>
        </div>
        <div className="dashboard-section dashboard-section--primary">
          <span className="section-heading">API Health</span>
          <div className="card skeleton-list">
            {Array.from({ length: 3 }).map((_, index) => (
              <span key={index} className="skeleton skeleton-line" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const loadError = monitorsQuery.error ?? incidentsQuery.error
  if (loadError) {
    return (
      <div className="alert">
        <strong>Unable to load monitoring data.</strong>
        <span role="alert">{loadError.message}</span>
      </div>
    )
  }

  const incidents = incidentsQuery.data ?? []
  const activeIncidents = incidents.filter((incident) => incident.status !== 'RESOLVED')

  const metricsByMonitorId = new Map(
    monitors.map((monitor, index) => [monitor.id, metricsQueries[index]?.data]),
  )

  const healthyCount = monitors.filter(
    (monitor) => metricsByMonitorId.get(monitor.id)?.currentHealth === 'healthy',
  ).length

  const uptimes = monitors
    .map((monitor) => metricsByMonitorId.get(monitor.id)?.uptimePercentage)
    .filter((value): value is number => value != null)
  const overallUptime =
    uptimes.length > 0
      ? Math.round((uptimes.reduce((sum, value) => sum + value, 0) / uptimes.length) * 10) / 10
      : null

  const downCount = monitors.filter(
    (monitor) => metricsByMonitorId.get(monitor.id)?.currentHealth === 'down',
  ).length

  const rows: ApiHealthRow[] = monitors.map((monitor) => ({
    monitor,
    metrics: metricsByMonitorId.get(monitor.id),
    activeIncidentCount: activeIncidents.filter((incident) => incident.apiId === monitor.id).length,
  }))

  const monitorNames = Object.fromEntries(monitors.map((monitor) => [monitor.id, monitor.name]))

  return (
    <div className="dashboard-page">
      <PageHeader
        title="Overview"
        description="Monitor health and breaking API changes."
        action={<AddMonitorForm />}
      />

      <div className="health-strip">
        <span className="health-strip__item">
          <strong>{monitors.length}</strong> APIs
        </span>
        <span className="health-strip__divider" aria-hidden="true" />
        <span className="health-strip__item status-healthy">
          <strong>{healthyCount}</strong> Healthy
        </span>
        <span className={`health-strip__item${downCount > 0 ? ' status-critical' : ' text-muted'}`}>
          {downCount} down
        </span>
        <span className="health-strip__divider" aria-hidden="true" />
        <span className="health-strip__item">
          <strong>{activeIncidents.length}</strong> Active Incident
          {activeIncidents.length === 1 ? '' : 's'}
        </span>
        <span className="health-strip__divider" aria-hidden="true" />
        <span className="health-strip__item">
          <strong>{overallUptime != null ? `${overallUptime}%` : '—'}</strong> Uptime
        </span>
      </div>

      <div className="dashboard-section">
        <span className="section-heading">Active Incidents</span>
        <ActiveIncidentsList incidents={activeIncidents} monitorNames={monitorNames} />
      </div>

      <div className="dashboard-section dashboard-section--primary">
        <span className="section-heading">API Health</span>
        {monitors.length === 0 ? (
          <div className="card empty-state">
            <strong>No APIs yet</strong>
            <span>Add your first endpoint to begin tracking uptime, latency, and response changes.</span>
          </div>
        ) : (
          <div className="card">
            <ApiHealthTable rows={rows} />
          </div>
        )}
      </div>
    </div>
  )
}
