import type { MonitorCheck } from '../../types/monitor'
import { formatRelativeTime } from '../../utils/formatRelativeTime'
import { StatusDot } from '../../components/StatusDot'

interface RecentChecksTableProps {
  checks: MonitorCheck[]
}

export function RecentChecksTable({ checks }: RecentChecksTableProps) {
  if (checks.length === 0) {
    return <p className="empty-state">No monitoring checks yet.</p>
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Result</th>
            <th>HTTP</th>
            <th>Latency</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((check) => (
            <tr key={check.id}>
              <td className="text-muted">{formatRelativeTime(check.checkedAt)}</td>
              <td>
                <StatusDot
                  status={check.success ? 'healthy' : 'critical'}
                  label={check.success ? 'Healthy' : 'Failed'}
                />
              </td>
              <td className="text-mono">{check.httpStatus ?? '—'}</td>
              <td className="text-mono">
                {check.latencyMs != null ? `${check.latencyMs}ms` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
