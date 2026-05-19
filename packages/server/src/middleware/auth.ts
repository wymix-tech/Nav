import type { Context, Next } from 'hono'
import type { SignOptions } from 'jsonwebtoken'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.NAV_JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('NAV_JWT_SECRET environment variable is required')
}
const JWT_SECRET_VALUE: string = JWT_SECRET
const JWT_EXPIRES_IN = (process.env.NAV_JWT_EXPIRES ?? '7d') as SignOptions['expiresIn']

export function generateToken(): string {
  return jwt.sign({ role: 'admin' }, JWT_SECRET_VALUE, { expiresIn: JWT_EXPIRES_IN })
}

export function verifyToken(token: string): boolean {
  try {
    jwt.verify(token, JWT_SECRET_VALUE)
    return true
  } catch {
    return false
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: '未登录' } }, 401)
  }
  const token = authHeader.slice(7)
  if (!verifyToken(token)) {
    return c.json({ error: { code: 'TOKEN_INVALID', message: 'Token 无效或已过期' } }, 401)
  }
  await next()
}
