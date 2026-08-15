import type { Response } from 'express'
import type { AuthRequest } from '../middleware/auth'
import type { CreateApiMonitorInput, UpdateApiMonitorInput } from '../schemas/apiMonitorSchemas'
import * as apiMonitorService from '../services/apiMonitorService'
import { recordCheck } from '../services/monitorService'
import * as metricsService from '../services/metricsService'

const DEFAULT_CHECKS_LIMIT = 50
const MAX_CHECKS_LIMIT = 200

export async function list(req: AuthRequest, res: Response) {
  const monitors = await apiMonitorService.listApiMonitors(req.userId as string)
  res.status(200).json(monitors)
}

export async function create(req: AuthRequest, res: Response) {
  const data = req.body as CreateApiMonitorInput
  const monitor = await apiMonitorService.createApiMonitor(req.userId as string, data)
  res.status(201).json(monitor)
}

export async function get(req: AuthRequest, res: Response) {
  const monitor = await apiMonitorService.getApiMonitor(
    req.userId as string,
    req.params.id as string,
  )
  res.status(200).json(monitor)
}

export async function update(req: AuthRequest, res: Response) {
  const data = req.body as UpdateApiMonitorInput
  const monitor = await apiMonitorService.updateApiMonitor(
    req.userId as string,
    req.params.id as string,
    data,
  )
  res.status(200).json(monitor)
}

export async function remove(req: AuthRequest, res: Response) {
  await apiMonitorService.deleteApiMonitor(req.userId as string, req.params.id as string)
  res.status(204).send()
}

export async function poll(req: AuthRequest, res: Response) {
  const monitor = await apiMonitorService.getApiMonitor(
    req.userId as string,
    req.params.id as string,
  )
  const check = await recordCheck(monitor)
  res.status(201).json(check)
}

export async function checks(req: AuthRequest, res: Response) {
  const requested = Number(req.query.limit)
  const limit =
    Number.isFinite(requested) && requested > 0
      ? Math.min(requested, MAX_CHECKS_LIMIT)
      : DEFAULT_CHECKS_LIMIT

  const result = await metricsService.listMonitorChecks(
    req.userId as string,
    req.params.id as string,
    limit,
  )
  res.status(200).json(result)
}

export async function metrics(req: AuthRequest, res: Response) {
  const result = await metricsService.getMonitorMetrics(
    req.userId as string,
    req.params.id as string,
  )
  res.status(200).json(result)
}
