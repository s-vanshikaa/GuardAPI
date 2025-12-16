import { apiRequest } from '../../services/apiClient'
import type { Incident } from '../../types/incident'

export function listIncidents(token: string, filters: { apiId?: string } = {}): Promise<Incident[]> {
  const query = filters.apiId ? `?apiId=${encodeURIComponent(filters.apiId)}` : ''
  return apiRequest<Incident[]>(`/incidents${query}`, { token })
}

export function getIncident(token: string, id: string): Promise<Incident> {
  return apiRequest<Incident>(`/incidents/${id}`, { token })
}

export function acknowledgeIncident(token: string, id: string): Promise<Incident> {
  return apiRequest<Incident>(`/incidents/${id}/acknowledge`, { method: 'POST', token })
}

export function resolveIncident(token: string, id: string): Promise<Incident> {
  return apiRequest<Incident>(`/incidents/${id}/resolve`, { method: 'POST', token })
}
