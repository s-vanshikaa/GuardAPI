import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { getMonitor, getMonitorChecks, getMonitorMetrics } from '../features/monitors/monitorsApi'
import { listIncidents } from '../features/incidents/incidentsApi'
import { StatCard } from '../components/StatCard'
import { StatGridSkeleton } from '../components/StatGridSkeleton'
import { StatusDot } from '../components/StatusDot'
import { healthToLabel, healthToStatus } from '../components/statusMappings'
import { IconArrowLeft } from '../components/icons'
import { LatencyChart } from '../features/monitors/LatencyChart'
import { RecentChecksTable } from '../features/monitors/RecentChecksTable'
import { ActiveIncidentsList } from '../features/incidents/ActiveIncidentsList'
import { SchemaChangesList } from '../features/monitors/SchemaChangesList'
import './ApiDetailPage.css'

export function ApiDetailPage() {
  const { id } = useParams<{ id: string }>()
  const apiId = id as string
  const { token } = useAuth()

  const monitorQuery = useQuery({
    queryKey: ['monitor', apiId],
    queryFn: () => getMonitor(token as string, apiId),
  })

  const metricsQuery = useQuery({
    queryKey: ['monitorMetrics', apiId],
    queryFn: () => getMonitorMetrics(token as string, apiId),
  })

  const checksQuery = useQuery({
    queryKey: ['monitorChecks', apiId],
    queryFn: () => getMonitorChecks(token as string, apiId),
  })

  const incidentsQuery = useQuery({
    queryKey: ['incidents', apiId],
    queryFn: () => listIncidents(token as string, { apiId }),
  })

  if (monitorQuery.isError) {
    return (
      <div className="alert">
        <strong>Unable to load this API.</strong>
        <span role="alert">{monitorQuery.error.message}</span>
      </div>
    )
  }

  if (metricsQuery.isError || checksQuery.isError || incidentsQuery.isError) {
    const dataError = metricsQuery.error ?? checksQuery.error ?? incidentsQuery.error
    return (
      <div className="alert">
        <strong>Unable to load monitoring data.</strong>
        <span role="alert">{dataError?.message}</span>
      </div>
    )
  }

  if (
    monitorQuery.isPending ||
    metricsQuery.isPending ||
    checksQuery.isPending ||
    incidentsQuery.isPending
  ) {
    return (
      <div className="section">
        <Link to="/" className="detail-back">
          <IconArrowLeft />
          Back to dashboard
        </Link>
        <StatGridSkeleton loadingLabel="Loading API…" />
      </div>
    )
  }

  const monitor = monitorQuery.data
  const metrics = metricsQuery.data
  const checks = checksQuery.data
  const incidents = incidentsQuery.data

  return (
    <>
      <Link to="/" className="detail-back">
        <IconArrowLeft />
        Back to dashboard
      </Link>

      <div className="detail-header">
        <div className="detail-header__title-row">
          <h1>{monitor.name}</h1>
          <StatusDot
            status={healthToStatus(metrics.currentHealth)}
            label={healthToLabel(metrics.currentHealth)}
          />
        </div>
        <span className="detail-header__url text-mono">{monitor.endpointUrl}</span>
      </div>

      <div className="stat-grid">
        <StatCard
          label="Uptime"
          value={metrics.uptimePercentage != null ? `${metrics.uptimePercentage}%` : '—'}
        />
        <StatCard
          label="Avg Latency"
          value={metrics.averageLatencyMs != null ? `${metrics.averageLatencyMs}ms` : '—'}
        />
        <StatCard
          label="Latest"
          value={metrics.latestLatencyMs != null ? `${metrics.latestLatencyMs}ms` : '—'}
        />
        <StatCard label="Total Checks" value={String(metrics.totalChecks)} />
      </div>

      <div className="section">
        <span className="section-heading">Latency</span>
        <LatencyChart checks={checks} />
      </div>

      <div className="section">
        <span className="section-heading">Recent Checks</span>
        <div className="card">
          <RecentChecksTable checks={checks} />
        </div>
      </div>

      <div className="section">
        <span className="section-heading">Incidents</span>
        <div className="card">
          <ActiveIncidentsList incidents={incidents} />
        </div>
      </div>

      <div className="section">
        <span className="section-heading">Schema Changes</span>
        <div className="card">
          <SchemaChangesList incidents={incidents} />
        </div>
      </div>
    </>
  )
}
