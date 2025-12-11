import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { list, get, acknowledge, resolve } from '../controllers/incidentController'

const router = Router()

router.use(requireAuth)

router.get('/', list)
router.get('/:id', get)
router.post('/:id/acknowledge', acknowledge)
router.post('/:id/resolve', resolve)

export default router
