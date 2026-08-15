import type { Request, Response } from 'express'
import type { AuthRequest } from '../middleware/auth'
import type { RegisterInput, LoginInput } from '../schemas/authSchemas'
import * as authService from '../services/authService'

export async function register(req: Request, res: Response) {
  const { email, password } = req.body as RegisterInput
  const result = await authService.registerUser(email, password)
  res.status(201).json(result)
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as LoginInput
  const result = await authService.loginUser(email, password)
  res.status(200).json(result)
}

export async function me(req: AuthRequest, res: Response) {
  const user = await authService.getUserById(req.userId as string)
  res.status(200).json({ user })
}
