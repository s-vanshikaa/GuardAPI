import { apiRequest } from '../../services/apiClient'
import type { ApiMonitor, MonitorCheck, MonitorMetrics } from '../../types/monitor'

export function listMonitors(token: string): Promise<ApiMonitor[]> {
  return apiRequest<ApiMonitor[]>('/apis', { token })
}

export function getMonitor(token: string, apiId: string): Promise<ApiMonitor> {
  return apiRequest<ApiMonitor>(`/apis/${apiId}`, { token })
}

export function getMonitorMetrics(token: string, apiId: string): Promise<MonitorMetrics> {
  return apiRequest<MonitorMetrics>(`/apis/${apiId}/metrics`, { token })
}

export function getMonitorChecks(token: string, apiId: string): Promise<MonitorCheck[]> {
  return apiRequest<MonitorCheck[]>(`/apis/${apiId}/checks`, { token })
}

export interface CreateMonitorInput {
  name: string
  endpointUrl: string
}

export function createMonitor(token: string, input: CreateMonitorInput): Promise<ApiMonitor> {
  return apiRequest<ApiMonitor>('/apis', { method: 'POST', token, body: input })
}
