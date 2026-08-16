import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import {
  acknowledgeIncident,
  getIncident,
  resolveIncident,
} from '../features/incidents/incidentsApi'
import { getMonitor, getMonitorChecks } from '../features/monitors/monitorsApi'
import { StatusDot } from '../components/StatusDot'
import { severityToStatus } from '../components/statusMappings'
import { IconArrowLeft } from '../components/icons'
import { RecentChecksTable } from '../features/monitors/RecentChecksTable'
import { SchemaDiffPanel } from '../features/monitors/SchemaDiffPanel'
import { formatRelativeTime } from '../utils/formatRelativeTime'
import './IncidentDetailPage.css'

export function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const incidentId = id as string
  const { token } = useAuth()
  const queryClient = useQueryClient()

  const incidentQuery = useQuery({
    queryKey: ['incident', incidentId],
    queryFn: () => getIncident(token as string, incidentId),
  })

  const apiId = incidentQuery.data?.apiId

  const monitorQuery = useQuery({
    queryKey: ['monitor', apiId],
    queryFn: () => getMonitor(token as string, apiId as string),
    enabled: !!apiId,
  })

  const checksQuery = useQuery({
    queryKey: ['monitorChecks', apiId],
    queryFn: () => getMonitorChecks(token as string, apiId as string),
    enabled: !!apiId,
  })

  const acknowledgeMutation = useMutation({
    mutationFn: () => acknowledgeIncident(token as string, incidentId),
    onSuccess: (updated) => {
      queryClient.setQueryData(['incident', incidentId], updated)
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
    },
  })

  const resolveMutation = useMutation({
    mutationFn: () => resolveIncident(token as string, incidentId),
    onSuccess: (updated) => {
      queryClient.setQueryData(['incident', incidentId], updated)
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
    },
  })

  if (incidentQuery.isError) {
    return (
      <div className="alert">
        <strong>Unable to load this incident.</strong>
        <span role="alert">{incidentQuery.error.message}</span>
      </div>
    )
  }

  if (incidentQuery.isPending) {
    return (
      <div className="section">
        <Link to="/" className="detail-back">
          <IconArrowLeft />
          Back to dashboard
        </Link>
        <p className="loading-caption">Loading incident…</p>
        <div className="card skeleton-list">
          {Array.from({ length: 3 }).map((_, index) => (
            <span key={index} className="skeleton skeleton-line" />
          ))}
        </div>
      </div>
    )
  }

  const incident = incidentQuery.data
  const actionError = acknowledgeMutation.error ?? resolveMutation.error

  return (
    <>
      <Link to={`/apis/${incident.apiId}`} className="detail-back">
        <IconArrowLeft />
        Back to API
      </Link>

      <div className="detail-header">
        <div className="detail-header__title-row">
          <h1>{incident.title}</h1>
          <StatusDot status={severityToStatus(incident.severity)} label={incident.severity} />
          <span className="badge">{incident.status}</span>
        </div>
        <span className="incident-detail__meta">
          {monitorQuery.data && (
            <Link to={`/apis/${incident.apiId}`} className="incident-detail__meta-link">
              {monitorQuery.data.name}
            </Link>
          )}
          <span> · Opened {formatRelativeTime(incident.openedAt)}</span>
          {incident.resolvedAt && (
            <span> · Resolved {formatRelativeTime(incident.resolvedAt)}</span>
          )}
        </span>
      </div>

      {incident.type === 'OUTAGE' && incident.description && (
        <div className="section">
          <span className="section-heading">Summary</span>
          <p className="incident-detail__summary">{incident.description}</p>
        </div>
      )}

      <div className="section">
        <span className="section-heading">Related Monitoring Checks</span>
        <div className="card">
          {checksQuery.isError ? (
            <div className="alert">
              <strong>Unable to load monitoring checks.</strong>
              <span role="alert">{checksQuery.error.message}</span>
            </div>
          ) : checksQuery.isPending ? (
            <div className="skeleton-list">
              <span className="skeleton skeleton-line" />
            </div>
          ) : (
            <RecentChecksTable checks={checksQuery.data} />
          )}
        </div>
      </div>

      {incident.type === 'SCHEMA_CHANGE' && (
        <div className="section">
          <span className="section-heading">Schema Change</span>
          <div className="card">
            <SchemaDiffPanel description={incident.description} />
          </div>
        </div>
      )}

      <div className="section">
        <span className="section-heading">Actions</span>
        {incident.status === 'RESOLVED' ? (
          <p className="text-muted">
            This incident was resolved {formatRelativeTime(incident.resolvedAt)}.
          </p>
        ) : (
          <div className="incident-detail__actions">
            {incident.status === 'OPEN' && (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={acknowledgeMutation.isPending}
                onClick={() => acknowledgeMutation.mutate()}
              >
                {acknowledgeMutation.isPending ? 'Acknowledging…' : 'Acknowledge'}
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={resolveMutation.isPending}
              onClick={() => resolveMutation.mutate()}
            >
              {resolveMutation.isPending ? 'Resolving…' : 'Resolve'}
            </button>
          </div>
        )}
        {actionError && (
          <p role="alert" className="form-error">
            {actionError.message}
          </p>
        )}
      </div>
    </>
  )
}
