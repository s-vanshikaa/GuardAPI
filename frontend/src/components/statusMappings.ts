import type { MonitorHealth } from '../types/monitor'
import type { IncidentSeverity } from '../types/incident'
import type { Status } from './StatusDot'

export function healthToStatus(health: MonitorHealth): Status {
  if (health === 'healthy') return 'healthy'
  if (health === 'down') return 'critical'
  return 'unknown'
}

export function healthToLabel(health: MonitorHealth): string {
  if (health === 'healthy') return 'Healthy'
  if (health === 'down') return 'Down'
  return 'Unknown'
}

export function severityToStatus(severity: IncidentSeverity): Status {
  if (severity === 'CRITICAL') return 'critical'
  if (severity === 'WARNING') return 'warning'
  return 'info'
}
