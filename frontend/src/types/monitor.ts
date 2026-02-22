export interface ApiMonitor {
  id: string
  userId: string
  name: string
  endpointUrl: string
  description: string | null
  expectedStatus: number
  pollIntervalMinutes: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface MonitorCheck {
  id: string
  apiId: string
  checkedAt: string
  success: boolean
  httpStatus: number | null
  latencyMs: number | null
  errorType: string | null
}

export type MonitorHealth = 'healthy' | 'down' | 'unknown'

// uptimePercentage, averageLatencyMs, the percentiles, and the check counts
// are all a rolling 24-hour window; the current* fields reflect the latest
// check ever recorded, regardless of the window.
export interface MonitorMetrics {
  currentHealth: MonitorHealth
  latestHttpStatus: number | null
  latestLatencyMs: number | null
  lastCheckedAt: string | null
  uptimePercentage: number | null
  averageLatencyMs: number | null
  p50LatencyMs: number | null
  p95LatencyMs: number | null
  p99LatencyMs: number | null
  totalChecks: number
  successfulChecks: number
  failedChecks: number
}
