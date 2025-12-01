import bcrypt from 'bcrypt'
import prisma from '../utils/prisma'
import { AppError } from '../utils/errors'
import { signToken } from '../utils/jwt'

const SALT_ROUNDS = 10

export async function registerUser(email: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw new AppError(409, 'EMAIL_TAKEN', 'Email already registered')
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  const user = await prisma.user.create({ data: { email, passwordHash } })

  return { token: signToken(user.id), user: { id: user.id, email: user.email } }
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials')
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials')
  }

  return { token: signToken(user.id), user: { id: user.id, email: user.email } }
}

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not found')
  }
  return { id: user.id, email: user.email }
}
