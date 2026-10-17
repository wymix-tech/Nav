import { Hono } from 'hono'
import { assert, record } from '@nav/shared'
import bcrypt from 'bcryptjs'
import { generateToken, verifyToken } from '../middleware/auth.js'
import { clientAddress, RateLimiter } from '../security.js'
const auth = new Hono()
const passwordHash =
  process.env.NAV_PASSWORD_HASH ??
  (process.env.NAV_PASSWORD ? await bcrypt.hash(process.env.NAV_PASSWORD, 10) : null)
const limit = new RateLimiter()
const globalLimit = new RateLimiter(100, 60_000, 1)
auth.post('/login', async (c) => {
  if (!passwordHash)
    return c.json({ error: { code: 'NO_PASSWORD', message: '服务端未配置密码' } }, 503)
  const ip = clientAddress(c)
  if (!limit.allow(ip) || !globalLimit.allow('all')) {
    c.header('Retry-After', '900')
    return c.json({ error: { code: 'RATE_LIMITED', message: '登录尝试过多，请稍后重试' } }, 429)
  }
  const body = await c.req.json()
  assert(record(body), '请求必须为 JSON 对象')
  const { password } = body
  if (
    typeof password !== 'string' ||
    !password.length ||
    Buffer.byteLength(password) > 72 ||
    !(await bcrypt.compare(password, passwordHash))
  )
    return c.json({ error: { code: 'INVALID_PASSWORD', message: '密码错误（最多 72 字节）' } }, 401)
  limit.clear(ip)
  return c.json({ token: generateToken() })
})
auth.post('/verify', (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer /, '')
  const valid = !!token && verifyToken(token)
  return c.json({ valid }, valid ? 200 : 401)
})
export default auth
