import { Link, useNavigate } from 'react-router-dom'
import type { Incident, IncidentSeverity } from '../../types/incident'
import { formatRelativeTime } from '../../utils/formatRelativeTime'
import { StatusDot } from '../../components/StatusDot'
import { severityToStatus } from '../../components/statusMappings'
import './ActiveIncidentsList.css'

const SEVERITY_ORDER: Record<IncidentSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 }

interface ActiveIncidentsListProps {
  incidents: Incident[]
  monitorNames?: Record<string, string>
}

export function ActiveIncidentsList({ incidents, monitorNames }: ActiveIncidentsListProps) {
  const navigate = useNavigate()
  const sorted = [...incidents].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  )

  if (sorted.length === 0) {
    return <p className="empty-state">No active incidents.</p>
  }

  return (
    <ul className="incident-list">
      {sorted.map((incident) => (
        <li
          key={incident.id}
          className={`incident-row incident-row--clickable${incident.severity === 'CRITICAL' ? ' incident-row--critical' : ''}`}
          onClick={() => navigate(`/incidents/${incident.id}`)}
        >
          <span className="incident-row__severity">
            <StatusDot status={severityToStatus(incident.severity)} label={incident.severity} />
          </span>
          <span className="incident-row__body">
            <Link
              to={`/incidents/${incident.id}`}
              className="incident-row__title-link"
              onClick={(event) => event.stopPropagation()}
            >
              {incident.title}
            </Link>
            {monitorNames?.[incident.apiId] && (
              <span className="incident-row__meta">{monitorNames[incident.apiId]}</span>
            )}
          </span>
          <span className="incident-row__time">{formatRelativeTime(incident.openedAt)}</span>
          <span className="incident-row__status">
            <span className="badge">{incident.status}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
