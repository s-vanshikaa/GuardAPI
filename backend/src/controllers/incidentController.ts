import type { Response } from 'express'
import type { AuthRequest } from '../middleware/auth'
import type { IncidentStatus } from '@prisma/client'
import * as incidentService from '../services/incidentService'

const VALID_STATUSES: IncidentStatus[] = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED']

export async function list(req: AuthRequest, res: Response) {
  const apiId = typeof req.query.apiId === 'string' ? req.query.apiId : undefined
  const status =
    typeof req.query.status === 'string' &&
    VALID_STATUSES.includes(req.query.status as IncidentStatus)
      ? (req.query.status as IncidentStatus)
      : undefined

  const incidents = await incidentService.listIncidents(req.userId as string, { apiId, status })
  res.status(200).json(incidents)
}

export async function get(req: AuthRequest, res: Response) {
  const incident = await incidentService.getIncident(req.userId as string, req.params.id as string)
  res.status(200).json(incident)
}

export async function acknowledge(req: AuthRequest, res: Response) {
  const incident = await incidentService.acknowledgeIncident(
    req.userId as string,
    req.params.id as string,
  )
  res.status(200).json(incident)
}

export async function resolve(req: AuthRequest, res: Response) {
  const incident = await incidentService.resolveIncident(
    req.userId as string,
    req.params.id as string,
  )
  res.status(200).json(incident)
}
