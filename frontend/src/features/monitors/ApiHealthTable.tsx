import { Link, useNavigate } from 'react-router-dom'
import type { ApiMonitor, MonitorMetrics } from '../../types/monitor'
import { formatRelativeTime } from '../../utils/formatRelativeTime'
import { StatusDot } from '../../components/StatusDot'
import { healthToLabel, healthToStatus } from '../../components/statusMappings'

export interface ApiHealthRow {
  monitor: ApiMonitor
  metrics: MonitorMetrics | undefined
  activeIncidentCount: number
}

interface ApiHealthTableProps {
  rows: ApiHealthRow[]
}

export function ApiHealthTable({ rows }: ApiHealthTableProps) {
  const navigate = useNavigate()

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>API</th>
            <th>Health</th>
            <th>Uptime</th>
            <th>Latency</th>
            <th>Last Checked</th>
            <th>Incidents</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ monitor, metrics, activeIncidentCount }) => {
            const health = metrics?.currentHealth ?? 'unknown'
            return (
              <tr
                key={monitor.id}
                className="table-row--clickable"
                onClick={() => navigate(`/apis/${monitor.id}`)}
              >
                <td>
                  <Link
                    to={`/apis/${monitor.id}`}
                    className="table-primary-link"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {monitor.name}
                  </Link>
                  <div className="text-mono text-muted table-subtext">{monitor.endpointUrl}</div>
                </td>
                <td>
                  <StatusDot status={healthToStatus(health)} label={healthToLabel(health)} />
                </td>
                <td>{metrics?.uptimePercentage != null ? `${metrics.uptimePercentage}%` : '—'}</td>
                <td className="text-mono">
                  {metrics?.latestLatencyMs != null ? `${metrics.latestLatencyMs}ms` : '—'}
                </td>
                <td className="text-muted">{formatRelativeTime(metrics?.lastCheckedAt ?? null)}</td>
                <td>{activeIncidentCount}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
