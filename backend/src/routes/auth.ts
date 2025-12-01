import { Router } from 'express'
import { validateBody } from '../middleware/validate'
import { requireAuth } from '../middleware/auth'
import { registerSchema, loginSchema } from '../schemas/authSchemas'
import { register, login, me } from '../controllers/authController'

const router = Router()

router.post('/register', validateBody(registerSchema), register)
router.post('/login', validateBody(loginSchema), login)
router.get('/me', requireAuth, me)

export default router
