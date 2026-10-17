import { constants } from 'node:fs'
import { open, mkdir, realpath, readdir, writeFile } from 'node:fs/promises'
import { resolve, relative, isAbsolute, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
export const uploadDir = resolve(process.env.NAV_UPLOAD_DIR ?? '../uploads')
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
  if (!rasterSignature(bytes)) throw new Error('仅支持栅格图片')
  if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024)
    throw new Error('图片文件不能超过 5 MiB')
  const image = sharp(bytes, { limitInputPixels: 20_000_000, animated: false })
  const meta = await image.metadata()
  if (!['jpeg', 'png', 'webp', 'gif'].includes(meta.format ?? '')) throw new Error('仅支持栅格图片')
  const data = await image.rotate().webp({ quality: 88 }).toBuffer()
  if (data.length > 5 * 1024 * 1024) throw new Error('转换后的图片过大')
  await mkdir(uploadDir, { recursive: true })
  const files = await readdir(uploadDir)
  if (files.length >= Number(process.env.NAV_UPLOAD_MAX_FILES ?? 1000))
    throw new Error('上传配额已满')
  const name = `${randomUUID()}.webp`
  await writeFile(resolve(uploadDir, name), data, { flag: 'wx', mode: 0o600 })
  return `/uploads/${name}`
}
