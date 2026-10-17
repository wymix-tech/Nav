import { test, expect } from '@playwright/test'
import { createDashboard } from '../../packages/shared/src/index'
const backend = process.env.NAV_TEST_API ?? 'http://127.0.0.1:4000'
let token = ''
test.beforeAll(async ({ request }) => {
  const r = await request.post(backend + '/api/auth/login', {
    data: { password: process.env.NAV_TEST_PASSWORD ?? 'browser-test-password' },
  })
  expect(r.ok()).toBeTruthy()
  token = (await r.json()).token
})
test.beforeEach(async ({ page, request }) => {
  const current = await (await request.get(backend + '/api/dashboards')).json()
  const d = { ...createDashboard(), instanceId: current.instanceId }
  d.widgets = ['clock', 'search', 'bookmark', 'weather', 'monitor'].map((widgetId, i) => {
    const l = { x: (i % 3) * 4, y: Math.floor(i / 3) * 3, w: 4, h: 3 }
    return {
      id: `widget-${i}`,
      widgetId,
      source: 'builtin' as const,
      config:
        widgetId === 'bookmark'
          ? {
              groups: [
                {
                  name: '常用',
                  bookmarks: [
                    { title: '一个很长的书签标题，用于验证内容布局', url: 'https://example.com' },
                  ],
                },
              ],
            }
          : {},
      layouts: { lg: l, md: l, sm: l, xs: l },
    }
  })
  const response = await request.put(backend + '/api/dashboards/default/state', {
    headers: { Authorization: `Bearer ${token}`, 'If-Match': `"${current.revision}"` },
    data: { snapshot: d, operationId: crypto.randomUUID() },
  })
  expect(response.ok()).toBeTruthy()
  await page.addInitScript((token) => localStorage.setItem('nav_token', token), token)
  await page.route('https://wttr.in/**', (route) =>
    route.fulfill({
      json: {
        current_condition: [
          {
            temp_C: '22',
            temp_F: '72',
            FeelsLikeC: '22',
            FeelsLikeF: '72',
            weatherDesc: [{ value: 'Sunny' }],
            humidity: '50',
            windspeedKmph: '10',
            windspeedMiles: '6',
            winddir16Point: 'N',
            uvIndex: '2',
            pressure: '1012',
            cloudcover: '10',
          },
        ],
      },
    }),
  )
  await page.route('**/api/system/stats*', (route) =>
    route.fulfill({
      json: {
        cpu: { usage: 20, cores: 4, model: 'Test CPU', temp: 40 },
        memory: { total: 16, used: 4, percent: 25 },
        gpu: null,
        disks: [],
        uptime: '1时',
        hostname: 'test-host',
        platform: 'linux',
        loadavg: [0, 0, 0],
      },
    }),
  )
  await page.goto('/')
  await expect(page.locator('.css-grid-item')).toHaveCount(5)
  if (process.env.NAV_TEST_DIST === 'true')
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
})
test('desktop viewport matrix stays in bounds and window changes do not save layouts', async ({
  page,
  request,
}, testInfo) => {
  let writes = 0
  page.on('request', (r) => {
    if (r.method() === 'PUT') writes++
  })
  const before = await (await request.get(backend + '/api/dashboards')).json()
  for (const [width, height] of [
    [1024, 768],
    [1366, 768],
    [1920, 1080],
    [2560, 1440],
    [3440, 1440],
    [3840, 2160],
    [1080, 1920],
    [1366, 768],
  ]) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(120)
    const metrics = await page.locator('.css-grid-layout').evaluate((el) => {
      const root = el.getBoundingClientRect(),
        items = [...el.querySelectorAll('.css-grid-item')].map((i) => i.getBoundingClientRect())
      return {
        columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
        overflow: items.some((r) => r.left < root.left - 0.5 || r.right > root.right + 0.5),
        overlap: items.some((a, i) =>
          items.some(
            (b, j) =>
              i < j &&
              a.left < b.right - 0.5 &&
              a.right > b.left + 0.5 &&
              a.top < b.bottom - 0.5 &&
              a.bottom > b.top + 0.5,
          ),
        ),
      }
    })
    expect(metrics.overflow, `${width}:overflow`).toBeFalsy()
    expect(metrics.overlap, `${width}:overlap`).toBeFalsy()
    if (width === 1080) expect(metrics.columns).toBeGreaterThan(1)
  }
  expect(writes).toBe(0)
  const after = await (await request.get(backend + '/api/dashboards')).json()
  expect(after.revision).toBe(before.revision)
  await page.screenshot({ path: testInfo.outputPath('desktop-1366.png'), fullPage: true })
})
async function edit(page: any) {
  await page.locator('.floating-panel').hover()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.locator('.floating-panel').hover()
  await page.locator('.panel-actions button').filter({ hasText: '✕' }).click()
}
test('pointer drag is clamped and persists only once at completion', async ({ page, request }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await edit(page)
  await page.waitForTimeout(120)
  let writes = 0
  page.on('request', (r) => {
    if (r.method() === 'PUT') writes++
  })
  const handle = page.locator('.drag-handle').first(),
    box = (await handle.boundingBox())!
  await page.mouse.move(box.x + 10, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(1850, box.y + 10, { steps: 10 })
  expect(writes).toBe(0)
  await page.mouse.up()
  await expect.poll(() => writes).toBe(1)
  await expect(page.getByRole('status')).toContainText('已同步')
  const saved = await (await request.get(backend + '/api/dashboards')).json()
  for (const w of saved.widgets)
    expect(w.layouts.lg.x + w.layouts.lg.w).toBeLessThanOrEqual(saved.baseColumns)
  await page.reload()
  await expect(page.locator('.css-grid-item')).toHaveCount(5)
})
test('preferences cancel leaves title, background and saved revision unchanged', async ({
  page,
  request,
}) => {
  await page.locator('.floating-panel').hover()
  await page.locator('.panel-actions button').filter({ hasText: '⚙' }).click()
  const before = await (await request.get(backend + '/api/dashboards')).json()
  await page.getByPlaceholder('Nav - 个人导航页').fill('should not persist')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page).toHaveTitle(before.title)
  expect((await (await request.get(backend + '/api/dashboards')).json()).revision).toBe(
    before.revision,
  )
})
test('offline edits persist locally and synchronize after reconnection', async ({
  page,
  context,
  request,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await edit(page)
  await context.setOffline(true)
  const handle = page.locator('.drag-handle').first()
  await handle.focus()
  await handle.press('ArrowRight')
  await expect(page.getByRole('status')).toContainText('本机')
  if (process.env.NAV_TEST_DIST === 'true') {
    await page.reload()
    await expect(page.locator('.css-grid-item')).toHaveCount(5)
  }
  await context.setOffline(false)
  await expect
    .poll(async () => {
      const d = await (await request.get(backend + '/api/dashboards')).json()
      return d.widgets.find((w: any) => w.id === 'widget-0').layouts.lg.x
    })
    .toBe(1)
  const saved = await (await request.get(backend + '/api/dashboards')).json()
  expect(saved.widgets.find((w: any) => w.id === 'widget-0').layouts.lg.x).toBe(1)
  await page.reload()
  await expect(page.locator('[data-widget-id="widget-0"]')).toHaveCSS('grid-column-start', '2')
})
test('logout exits editing and removes drag handles immediately', async ({ page }) => {
  await edit(page)
  await expect(page.locator('.drag-handle')).toHaveCount(5)
  await page.locator('.floating-panel').hover()
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(page.locator('.drag-handle')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('nav_token'))).toBeNull()
})
test('a plugin survives reload and cannot access its host or unapproved network', async ({
  page,
  request,
}) => {
  const commit = 'a'.repeat(40),
    url = `https://cdn.jsdelivr.net/gh/test/widget@${commit}/index.js`
  const widget = {
    widgetId: 'sandbox-test',
    commit,
    cdnUrl: url,
    installedAt: new Date().toISOString(),
    manifest: {
      manifestVersion: 2,
      name: 'sandbox-test',
      displayName: '隔离测试',
      version: '1',
      entry: 'index.js',
      description: 'test',
      author: 'test',
      icon: '',
      repository: 'https://github.com/test/widget',
      schema: {},
      size: { w: 4, h: 3 },
      minSize: { w: 2, h: 2 },
      networkOrigins: [],
    },
  }
  const { revision: catalogRevision } = await (
    await request.get(backend + '/api/installed-widgets/revision')
  ).json()
  const installed = await request.post(backend + '/api/installed-widgets', {
    headers: {
      Authorization: `Bearer ${token}`,
      'If-Match': String(catalogRevision),
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: widget,
  })
  expect(installed.ok()).toBeTruthy()
  const d = await (await request.get(backend + '/api/dashboards')).json(),
    l = { x: 8, y: 3, w: 4, h: 3 }
  d.widgets.push({
    id: 'plugin-fixture',
    widgetId: widget.widgetId,
    source: 'installed',
    config: {},
    layouts: { lg: l, md: l, sm: l, xs: l },
  })
  expect(
    (
      await request.put(backend + '/api/dashboards/default/state', {
        headers: { Authorization: `Bearer ${token}`, 'If-Match': `"${d.revision}"` },
        data: { snapshot: d, operationId: crypto.randomUUID() },
      })
    ).ok(),
  ).toBeTruthy()
  await page.route(url, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: `export async function mount(root){let host=false,network=false;try{parent.localStorage.getItem('nav_token')}catch{host=true}try{await fetch('https://unapproved.invalid/')}catch{network=true}root.textContent=host&&network?'isolated':'unsafe'}`,
    }),
  )
  await page.reload()
  await expect(page.frameLocator('.sandbox-widget iframe').locator('#root')).toHaveText('isolated')
  await page.reload()
  await expect(page.frameLocator('.sandbox-widget iframe').locator('#root')).toHaveText('isolated')
})
