import { Router } from 'express'
import { validateBody } from '../middleware/validate'
import { requireAuth } from '../middleware/auth'
import { authRateLimiter } from '../middleware/rateLimit'
import { registerSchema, loginSchema } from '../schemas/authSchemas'
import { register, login, me } from '../controllers/authController'

const router = Router()

router.post('/register', authRateLimiter, validateBody(registerSchema), register)
router.post('/login', authRateLimiter, validateBody(loginSchema), login)
router.get('/me', requireAuth, me)

export default router
