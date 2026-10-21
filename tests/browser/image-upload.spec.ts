import { createRequire } from 'node:module'
import { test, expect } from '../helpers/browserTest'
import { createDashboard } from '../../packages/shared/src/index'
import { login, saveFixture, isolateServices, backend } from '../helpers/runtimeFixture'

const serverRequire = createRequire(new URL('../../packages/server/package.json', import.meta.url))
const sharp = serverRequire('sharp')
let token = ''
test.use({ serviceWorkers: 'block' })
test.beforeAll(async ({ request }) => {
  token = await login(request)
})
test.beforeEach(async ({ page, request }) => {
  await saveFixture(request, token, createDashboard())
  await isolateServices(page, token)
  await page.goto('/')
  await page.locator('.floating-panel').hover()
  await page.locator('.panel-actions button').filter({ hasText: '⚙' }).click()
  await page.getByRole('button', { name: '图片', exact: true }).click()
})

test('539 KiB JPG uploads through the real server and a successful retry clears the error', async ({
  page,
  request,
}) => {
  const input = page.locator('input[type=file]')
  await input.setInputFiles({
    name: 'fake.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('<svg/>'),
  })
  await expect(page.getByRole('alert')).toContainText('仅支持 JPG、PNG、GIF、WebP')
  const jpeg = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#ace' } })
    .jpeg()
    .toBuffer()
  const buffer = Buffer.concat([jpeg, Buffer.alloc(539 * 1024 - jpeg.length)])
  await input.setInputFiles({ name: '图标.JPG', mimeType: 'image/jpeg', buffer })
  await expect(page.locator('.image-name')).toHaveText('图标.JPG')
  await expect(page.getByRole('alert')).toHaveCount(0)
  const background = await page
    .locator('.image-thumb')
    .evaluate((el) => (el as HTMLElement).style.backgroundImage)
  const path = background.match(/\/uploads\/[^"')]+/)![0]
  const image = await request.get(backend + path)
  expect(image.ok()).toBeTruthy()
  expect(image.headers()['content-type']).toBe('image/webp')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect
    .poll(
      async () =>
        (await (await request.get(backend + '/api/dashboards')).json()).background.images[0]?.src,
    )
    .toBe(path)
})

test('upload displays the actual server failure and explains a proxy size rejection', async ({
  page,
}) => {
  const input = page.locator('input[type=file]')
  const file = { name: 'icon.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fixture') }
  for (const failure of [
    { status: 400, message: '图片像素总数不能超过 2000 万，请缩小分辨率后重试' },
    { status: 500, message: '服务器无法保存图片，请联系管理员检查上传目录权限和磁盘空间' },
    { status: 507, message: '图片上传配额已满，请联系管理员清理上传目录' },
  ]) {
    await page.route('**/api/upload', (route) =>
      route.fulfill({ status: failure.status, json: { error: { message: failure.message } } }),
    )
    await input.setInputFiles(file)
    await expect(page.getByRole('alert')).toHaveText(`图片上传失败：${failure.message}`)
    await page.unroute('**/api/upload')
  }
  await page.route('**/api/upload', (route) =>
    route.fulfill({
      status: 413,
      contentType: 'text/html',
      body: '<h1>Request Entity Too Large</h1>',
    }),
  )
  await input.setInputFiles(file)
  await expect(page.getByRole('alert')).toContainText('反向代理的上传限制')
  await expect(page.locator('.image-item')).toHaveCount(0)
})

test('oversized files fail before a request and expired authentication is handled', async ({
  page,
}) => {
  let requests = 0
  await page.route('**/api/upload', (route) => {
    requests++
    return route.fulfill({ status: 401, json: { error: { message: 'Token 无效或已过期' } } })
  })
  const input = page.locator('input[type=file]')
  await input.setInputFiles({
    name: 'large.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  })
  await expect(page.getByRole('alert')).toContainText('图片文件不能超过 5 MiB')
  expect(requests).toBe(0)
  await input.setInputFiles({
    name: 'icon.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('fixture'),
  })
  await expect(page.getByRole('alert')).toContainText('请重新登录后上传')
  expect(await page.evaluate(() => localStorage.getItem('nav_token'))).toBeNull()
})
