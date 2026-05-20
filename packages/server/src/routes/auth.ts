import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { generateToken, verifyToken } from '../middleware/auth.js'

const auth = new Hono()

const PASSWORD_HASH = process.env.NAV_PASSWORD_HASH
  ?? (process.env.NAV_PASSWORD
    ? bcrypt.hashSync(process.env.NAV_PASSWORD, 10)
    : null)

// 简单速率限制：每个 IP 最多 5 次尝试，15 分钟窗口
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (entry.count >= MAX_ATTEMPTS) return false
  entry.count++
  return true
}

auth.post('/login', async (c) => {
  if (!PASSWORD_HASH) {
    return c.json({ error: { code: 'NO_PASSWORD', message: '服务端未配置密码' } }, 500)
  }
  const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return c.json({ error: { code: 'RATE_LIMITED', message: '登录尝试过多，请 15 分钟后重试' } }, 429)
  }
  const { password } = await c.req.json()
  if (!password || !bcrypt.compareSync(password, PASSWORD_HASH)) {
    return c.json({ error: { code: 'INVALID_PASSWORD', message: '密码错误' } }, 401)
  }
  // 登录成功，清除该 IP 的计数
  loginAttempts.delete(ip)
  const token = generateToken()
  return c.json({ token, expiresIn: 7 * 24 * 3600 })
})

auth.post('/verify', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ valid: false }, 401)
  }
  const valid = verifyToken(authHeader.slice(7))
  return c.json({ valid }, valid ? 200 : 401)
})

export default auth
