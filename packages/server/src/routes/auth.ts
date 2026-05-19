import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { generateToken, verifyToken } from '../middleware/auth.js'

const auth = new Hono()

const PASSWORD_HASH = process.env.NAV_PASSWORD_HASH
  ?? (process.env.NAV_PASSWORD
    ? bcrypt.hashSync(process.env.NAV_PASSWORD, 10)
    : null)

auth.post('/login', async (c) => {
  if (!PASSWORD_HASH) {
    return c.json({ error: { code: 'NO_PASSWORD', message: '服务端未配置密码' } }, 500)
  }
  const { password } = await c.req.json()
  if (!password || !bcrypt.compareSync(password, PASSWORD_HASH)) {
    return c.json({ error: { code: 'INVALID_PASSWORD', message: '密码错误' } }, 401)
  }
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
