import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { authMiddleware } from '../middleware/auth.js'
import { readImage, saveImage, UploadError } from '../uploadStorage.js'
const upload = new Hono()
upload.post('/', authMiddleware, bodyLimit({ maxSize: 6 * 1024 * 1024 }), async (c) => {
  const body = await c.req.parseBody()
  const file = body.file
  if (!(file instanceof File))
    return c.json({ error: { code: 'BAD_REQUEST', message: '请选择图片文件' } }, 400)
  if (file.size > 5 * 1024 * 1024)
    return c.json({ error: { code: 'TOO_LARGE', message: '图片不能超过 5 MiB' } }, 413)
  try {
    return c.json({
      url: await saveImage(new Uint8Array(await file.arrayBuffer())),
      notice: '图片将转为 WebP，动画仅保留第一帧',
    })
  } catch (error) {
    if (error instanceof UploadError)
      return c.json({ error: { code: error.code, message: error.message } }, error.status)
    console.error('Image upload storage failed', error instanceof Error ? error.name : 'Unknown')
    return c.json(
      {
        error: {
          code: 'UPLOAD_STORAGE_ERROR',
          message: '服务器无法保存图片，请联系管理员检查上传目录权限和磁盘空间',
        },
      },
      500,
    )
  }
})
export const files = new Hono()
files.get('/:filename', async (c) => {
  const image = await readImage(c.req.param('filename'))
  if (!image) return c.notFound()
  c.header('Content-Type', image.type)
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Content-Security-Policy', "default-src 'none'; sandbox")
  c.header('Cache-Control', 'public, max-age=31536000, immutable')
  return c.body(image.data as Uint8Array<ArrayBuffer>)
})
export default upload
