export type IncidentType = 'OUTAGE' | 'SCHEMA_CHANGE'
export type IncidentSeverity = 'INFO' | 'WARNING' | 'CRITICAL'
export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'

export interface Incident {
  id: string
  apiId: string
  type: IncidentType
  severity: IncidentSeverity
  status: IncidentStatus
  title: string
  description: string | null
  openedAt: string
  resolvedAt: string | null
}
