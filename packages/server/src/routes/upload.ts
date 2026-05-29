import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { writeFile, mkdir } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { randomBytes } from 'node:crypto'

const upload = new Hono()

const UPLOAD_DIR = resolve(process.env.NAV_UPLOAD_DIR ?? '../uploads')

// 确保上传目录存在
await mkdir(UPLOAD_DIR, { recursive: true })

upload.post('/', authMiddleware, async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']

  if (!file || !(file instanceof File)) {
    return c.json({ error: { code: 'BAD_REQUEST', message: '请上传文件' } }, 400)
  }

  // 限制文件大小 (5MB)
  if (file.size > 5 * 1024 * 1024) {
    return c.json({ error: { code: 'BAD_REQUEST', message: '文件大小不能超过 5MB' } }, 400)
  }

  // 限制文件类型
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: { code: 'BAD_REQUEST', message: '仅支持 jpg/png/gif/webp/svg 格式' } }, 400)
  }

  const ext = extname(file.name) || '.png'
  const filename = `${Date.now()}_${randomBytes(6).toString('hex')}${ext}`
  const filepath = resolve(UPLOAD_DIR, filename)

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filepath, buffer)

  return c.json({ url: `/uploads/${filename}` })
})

export default upload
