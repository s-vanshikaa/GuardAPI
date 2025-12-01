import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../utils/errors'
import { verifyToken } from '../utils/jwt'

export interface AuthRequest extends Request {
  userId?: string
}

export function requireAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'))
    return
  }

  try {
    const { userId } = verifyToken(header.slice(7))
    req.userId = userId
    next()
  } catch {
    next(new AppError(401, 'UNAUTHORIZED', 'Invalid or expired token'))
  }
}
