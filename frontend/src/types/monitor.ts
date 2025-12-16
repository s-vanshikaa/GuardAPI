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

export interface MonitorMetrics {
  currentHealth: MonitorHealth
  latestHttpStatus: number | null
  latestLatencyMs: number | null
  lastCheckedAt: string | null
  averageLatencyMs: number | null
  uptimePercentage: number | null
  totalChecks: number
  failedChecks: number
}
