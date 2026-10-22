import { constants } from 'node:fs'
import { open, mkdir, realpath, readdir, writeFile } from 'node:fs/promises'
import { resolve, relative, isAbsolute, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
export const uploadDir = resolve(process.env.NAV_UPLOAD_DIR ?? '../uploads')
export class UploadError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: 400 | 413 | 507 = 400,
  ) {
    super(message)
  }
}
const safeName = /^(?:[a-f0-9-]{36}|\d+_[a-f0-9]{12})\.(?:jpe?g|png|gif|webp)$/i
const mime: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}
function rasterSignature(data: Uint8Array): boolean {
  const b = Buffer.from(data)
  return (
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (b[0] === 255 && b[1] === 216 && b[2] === 255) ||
    ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString()) ||
    (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP')
  )
}
function inside(root: string, path: string): boolean {
  const r = relative(root, path)
  return !!r && !r.startsWith('..') && !isAbsolute(r)
}
export async function readImage(name: string): Promise<{ data: Uint8Array; type: string } | null> {
  if (!safeName.test(name)) return null
  await mkdir(uploadDir, { recursive: true })
  const root = await realpath(uploadDir)
  const path = resolve(root, name)
  if (!inside(root, path)) return null
  let handle
  try {
    if (!inside(root, await realpath(path))) return null
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > 10 * 1024 * 1024) return null
    const data = await handle.readFile()
    if (!rasterSignature(data)) return null
    const meta = await sharp(data, { limitInputPixels: 20_000_000 }).metadata()
    if (!['jpeg', 'png', 'webp', 'gif'].includes(meta.format ?? '')) return null
    if (
      mime[extname(name).toLowerCase()] !==
      (
        { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' } as Record<
          string,
          string
        >
      )[meta.format!]
    )
      return null
    return { data, type: mime[extname(name).toLowerCase()] }
  } catch {
    return null
  } finally {
    await handle?.close()
  }
}
export async function saveImage(bytes: Uint8Array): Promise<string> {
  if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024)
    throw new UploadError('TOO_LARGE', '图片文件不能超过 5 MiB', 413)
  if (!rasterSignature(bytes))
    throw new UploadError('UNSUPPORTED_IMAGE', '仅支持 JPG、PNG、GIF、WebP 图片；SVG 不受支持')
  let data: Buffer
  try {
    const image = sharp(bytes, { limitInputPixels: 20_000_000, animated: false })
    const meta = await image.metadata()
    if (!['jpeg', 'png', 'webp', 'gif'].includes(meta.format ?? ''))
      throw new UploadError('UNSUPPORTED_IMAGE', '仅支持 JPG、PNG、GIF、WebP 图片；SVG 不受支持')
    data = await image.rotate().webp({ quality: 88 }).toBuffer()
  } catch (error) {
    if (error instanceof UploadError) throw error
    if (error instanceof Error && /pixel limit/i.test(error.message))
      throw new UploadError(
        'DIMENSIONS_TOO_LARGE',
        '图片像素总数不能超过 2000 万，请缩小分辨率后重试',
      )
    throw new UploadError(
      'INVALID_IMAGE',
      '图片无法解码，文件可能已损坏，请重新导出为 JPG 或 PNG 后重试',
    )
  }
  if (data.length > 5 * 1024 * 1024)
    throw new UploadError('TOO_LARGE', '转换后的图片超过 5 MiB，请缩小分辨率后重试', 413)
  await mkdir(uploadDir, { recursive: true })
  const files = await readdir(uploadDir)
  if (files.length >= Number(process.env.NAV_UPLOAD_MAX_FILES ?? 1000))
    throw new UploadError(
      'UPLOAD_QUOTA_EXCEEDED',
      '图片上传配额已满，请联系管理员清理上传目录',
      507,
    )
  const name = `${randomUUID()}.webp`
  await writeFile(resolve(uploadDir, name), data, { flag: 'wx', mode: 0o600 })
  return `/uploads/${name}`
}
