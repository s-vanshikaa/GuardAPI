import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { validateBody } from '../middleware/validate'
import { createApiMonitorSchema, updateApiMonitorSchema } from '../schemas/apiMonitorSchemas'
import {
  list,
  create,
  get,
  update,
  remove,
  poll,
  checks,
  metrics,
} from '../controllers/apiMonitorController'

const router = Router()

router.use(requireAuth)

router.get('/', list)
router.post('/', validateBody(createApiMonitorSchema), create)
router.get('/:id', get)
router.patch('/:id', validateBody(updateApiMonitorSchema), update)
router.delete('/:id', remove)
router.post('/:id/poll', poll)
router.get('/:id/checks', checks)
router.get('/:id/metrics', metrics)

export default router
