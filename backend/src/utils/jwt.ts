import jwt from 'jsonwebtoken'

function requiredSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required')
  }
  return secret
}

const JWT_SECRET = requiredSecret()

export function signToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): { userId: string } {
  const payload = jwt.verify(token, JWT_SECRET)
  if (typeof payload !== 'object' || typeof payload.userId !== 'string') {
    throw new Error('Invalid token payload')
  }
  return { userId: payload.userId }
}
