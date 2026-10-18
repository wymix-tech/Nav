import { test, expect } from '@playwright/test'
import { createDashboard } from '../../packages/shared/src/index'
const backend = process.env.NAV_TEST_API ?? 'http://127.0.0.1:4000'
let token = ''
const pageErrors = new WeakMap<object, string[]>()
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) ?? []).toEqual([])
})
test.beforeAll(async ({ request }) => {
  const r = await request.post(backend + '/api/auth/login', {
    data: { password: process.env.NAV_TEST_PASSWORD ?? 'browser-test-password' },
  })
  expect(r.ok()).toBeTruthy()
  token = (await r.json()).token
})
test.beforeEach(async ({ page, request }) => {
  const errors: string[] = []
  pageErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
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
    data: { schemaVersion: 2, snapshot: d, operationId: crypto.randomUUID() },
  })
  expect(response.ok()).toBeTruthy()
  await page.addInitScript((token) => {
    if (window === window.top) localStorage.setItem('nav_token', token)
  }, token)
  await page.route('https://wttr.in/**', (route) =>
    route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
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
  await expect(page.locator('.clock-widget')).toBeVisible()
  await expect(page.locator('.search-widget')).toBeVisible()
  await expect(page.locator('.bookmark-widget')).toBeVisible()
  await expect(page.locator('.weather-widget')).toContainText('Sunny')
  await expect(page.locator('.monitor-widget')).toContainText('test-host')
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
        data: { schemaVersion: 2, snapshot: d, operationId: crypto.randomUUID() },
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
  await expect(page.locator('.weather-widget')).toContainText('Sunny')
  await expect(page.locator('.monitor-widget')).toContainText('test-host')
  await page.reload()
  await expect(page.frameLocator('.sandbox-widget iframe').locator('#root')).toHaveText('isolated')
})

async function replaceDashboard(page: any, request: any, change: (d: any) => void) {
  const d = await (await request.get(backend + '/api/dashboards')).json()
  change(d)
  const r = await request.put(backend + '/api/dashboards/default/state', {
    headers: { Authorization: `Bearer ${token}`, 'If-Match': String(d.revision) },
    data: { schemaVersion: 2, snapshot: d, operationId: crypto.randomUUID() },
  })
  expect(r.ok()).toBeTruthy()
  await page.reload()
}
test('legacy canvas adapts without writes, cancels gestures and saves one complete geometry on pointerup', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await replaceDashboard(page, request, (d) => {
    d.layoutMode = 'canvas'
    d.viewport = { panX: 0, panY: 0, zoom: 1, homeX: 0, homeY: 0 }
    d.canvasSettings = { version: 1, defaultCamera: { centerX: 960, centerY: 400, zoom: 1 } }
    d.viewportWidth = 1920
    d.viewportHeight = 1080
    d.widgets = d.widgets.slice(0, 2)
    d.widgets.forEach((w: any, i: number) => {
      w.canvas = { x: 140 + i * 440, y: 140, w: 360, h: 260, originalW: 320, originalH: 240 }
    })
  })
  await expect(page.locator('.canvas-item')).toHaveCount(2)
  const before = await (await request.get(backend + '/api/dashboards')).json()
  let writes = 0
  page.on('request', (r) => {
    if (r.method() === 'PUT') writes++
  })
  for (const [width, height] of [
    [1366, 768],
    [2560, 1440],
    [1080, 1920],
    [600, 900],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(100)
    await expect(page.locator('.canvas-grid')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy()
  }
  expect(writes).toBe(0)
  expect((await (await request.get(backend + '/api/dashboards')).json()).widgets).toEqual(
    before.widgets,
  )
  await edit(page)
  const handle = page.locator('.canvas-drag-handle').first()
  await expect(handle).toBeVisible()
  let box = (await handle.boundingBox())!
  await page.mouse.move(box.x + 10, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + 100, box.y + 50, { steps: 8 })
  expect(writes).toBe(0)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect(writes).toBe(0)
  box = (await handle.boundingBox())!
  await page.mouse.move(box.x + 10, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + 100, box.y + 50, { steps: 8 })
  expect(writes).toBe(0)
  await page.mouse.up()
  await expect.poll(() => writes).toBe(1)
  await expect(page.getByRole('status')).toContainText('已同步')
  const saved = await (await request.get(backend + '/api/dashboards')).json()
  expect(saved.widgets[0].canvas.x).not.toBe(before.widgets[0].canvas.x)
  expect(saved.widgets[0].canvas.originalW).toBe(320)
  expect(saved.canvasSettings).toEqual(before.canvasSettings)
  await page.reload()
  await expect(page.locator('.canvas-item')).toHaveCount(2)
})
test('restored chat streams a single reply, sanitizes markdown, isolates history and renders Docker monitoring', async ({
  page,
  request,
}) => {
  await page.route('**/api/chat/models', (r) => r.fulfill({ json: { models: ['test-model'] } }))
  await page.route('**/api/chat/defaults', (r) => r.fulfill({ json: { systemPrompt: '' } }))
  await page.route('**/api/chat/stream', async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`)
    await route.fulfill({
      contentType: 'text/event-stream',
      body:
        'data: ' +
        JSON.stringify({
          choices: [
            {
              delta: {
                content:
                  '**安全回复**<img src=x onerror="window.chatInjected=1"><script>window.chatInjected=1</script>',
              },
            },
          ],
        }) +
        '\n\ndata: [DONE]\n\n',
    })
  })
  await page.route('**/api/system/docker*', (r) =>
    r.fulfill({
      json: {
        available: true,
        containers: [
          {
            id: 'abcdef123456',
            name: 'nav-test',
            image: 'nav:test',
            state: 'running',
            status: 'Up',
            cpuPercent: 3,
            memUsage: '30MiB / 1GiB',
            memPercent: 3,
            netIO: '1kB / 2kB',
            blockIO: '0B / 0B',
            pids: 2,
          },
        ],
      },
    }),
  )
  await replaceDashboard(page, request, (d) => {
    d.widgets = d.widgets.slice(0, 3)
    d.widgets.forEach((w: any, i: number) => {
      w.widgetId = i < 2 ? 'chat' : 'docker'
      w.config = i < 2 ? { model: 'test-model' } : { containerName: 'nav-test' }
      w.layouts.lg = { x: i * 4, y: 0, w: 4, h: 6 }
    })
  })
  const chats = page.locator('.chat-widget')
  await expect(chats).toHaveCount(2)
  await chats.first().getByPlaceholder('输入消息...').fill('hello')
  await expect(chats.first().getByPlaceholder('输入消息...')).toHaveValue('hello')
  await chats.first().getByTitle('发送', { exact: true }).click()
  await expect(chats.first().locator('.message.assistant')).toHaveCount(1)
  await expect(chats.first().locator('.message.assistant strong')).toHaveText('安全回复')
  expect(await page.evaluate(() => (window as any).chatInjected)).toBeUndefined()
  await expect(chats.first().locator('.msg-content img,.msg-content script')).toHaveCount(0)
  await expect(chats.nth(1).locator('.message')).toHaveCount(0)
  await expect(page.locator('.docker-widget')).toContainText('nav-test')
  await page.reload()
  await expect(chats.first().locator('.message.assistant strong')).toHaveText('安全回复')
  await expect(chats.nth(1).locator('.message')).toHaveCount(0)
  await page.locator('.floating-panel').hover()
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(chats.first().getByPlaceholder('输入消息...')).toBeDisabled()
})

async function canvasCamera(page: any) {
  return page.locator('.canvas-grid').evaluate((root: HTMLElement) => {
    const el = root.querySelector('.canvas-content') as HTMLElement,
      m = new DOMMatrix(getComputedStyle(el).transform)
    return {
      centerX: (root.clientWidth / 2 - m.e) / m.a,
      centerY: (root.clientHeight / 2 - m.f) / m.a,
      zoom: m.a,
    }
  })
}
async function setupCanvas(page: any, request: any) {
  await page.setViewportSize({ width: 1366, height: 768 })
  await replaceDashboard(page, request, (d: any) => {
    d.layoutMode = 'canvas'
    d.canvasSettings = { version: 1, defaultCamera: { centerX: 400, centerY: 300, zoom: 1 } }
    d.widgets = d.widgets.slice(0, 2)
    d.widgets.forEach((w: any, i: number) => {
      w.canvas = { x: 150 + i * 360, y: 180, w: 320, h: 200 }
    })
  })
  await expect(page.locator('.canvas-item')).toHaveCount(2)
  await expect(page.getByRole('button', { name: '恢复画布 100%' })).toHaveText('100%')
}
test('canvas navigation, resize and list presentation never write document state or recreate widgets', async ({
  page,
  request,
}) => {
  await setupCanvas(page, request)
  const before = await (await request.get(backend + '/api/dashboards')).json()
  let writes = 0
  page.on('request', (r) => {
    if (r.method() === 'PUT') writes++
  })
  await page.locator('.search-widget').evaluate((el: any) => {
    el.stabilityToken = 'same-instance'
  })
  const viewport = page.locator('.canvas-grid'),
    box = (await viewport.boundingBox())!
  await page.mouse.move(box.x + 40, box.y + 40)
  await page.mouse.down()
  await page.mouse.move(box.x + 220, box.y + 110)
  await page.mouse.up()
  const panned = await canvasCamera(page)
  expect(panned.centerX).not.toBe(400)
  await page.setViewportSize({ width: 767, height: 900 })
  await page.waitForTimeout(100)
  expect(await canvasCamera(page)).toEqual(panned)
  await expect(viewport).not.toHaveClass(/stacked/)
  await page.getByRole('button', { name: '列表视图', exact: true }).click()
  await expect(viewport).toHaveClass(/stacked/)
  expect(await page.locator('.search-widget').evaluate((el: any) => el.stabilityToken)).toBe(
    'same-instance',
  )
  await page.getByRole('button', { name: '空间视图', exact: true }).click()
  expect(await canvasCamera(page)).toEqual(panned)
  await page.getByRole('button', { name: '放大画布' }).click()
  await page.getByRole('button', { name: '小地图', exact: true }).click()
  await page.locator('.canvas-minimap').click({ position: { x: 120, y: 50 } })
  await page.getByRole('button', { name: '适应全部', exact: true }).click()
  await page.getByRole('button', { name: '恢复画布 100%' }).click()
  const saved = await canvasCamera(page)
  await page.waitForTimeout(450)
  await page.reload()
  await expect(viewport).toBeVisible()
  await expect.poll(() => canvasCamera(page)).toEqual(saved)
  expect(writes).toBe(0)
  expect(await (await request.get(backend + '/api/dashboards')).json()).toEqual(before)
})
test('canvas wheel anchoring, cancellation and component scrolling respect event ownership', async ({
  page,
  request,
}) => {
  await setupCanvas(page, request)
  const box = (await page.locator('.canvas-grid').boundingBox())!,
    initial = await canvasCamera(page)
  const x = box.x + 60,
    y = box.y + 70
  await page.mouse.move(x, y)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -100)
  await page.keyboard.up('Control')
  await expect.poll(async () => (await canvasCamera(page)).zoom).toBeGreaterThan(1)
  const zoomed = await canvasCamera(page),
    beforeWorld = {
      x: initial.centerX + (60 - box.width / 2) / initial.zoom,
      y: initial.centerY + (70 - box.height / 2) / initial.zoom,
    }
  expect(
    Math.abs(zoomed.centerX + (60 - box.width / 2) / zoomed.zoom - beforeWorld.x),
  ).toBeLessThan(1)
  expect(
    Math.abs(zoomed.centerY + (70 - box.height / 2) / zoomed.zoom - beforeWorld.y),
  ).toBeLessThan(1)
  await page.keyboard.press('Escape')
  expect(await canvasCamera(page)).toEqual(initial)
  const search = page.locator('.search-widget'),
    searchBox = (await search.boundingBox())!
  await page.mouse.move(searchBox.x + 50, searchBox.y + 70)
  await page.mouse.wheel(0, 100)
  await page.waitForTimeout(100)
  expect(await canvasCamera(page)).toEqual(initial)
  await page.getByRole('button', { name: '手形工具', exact: true }).click()
  await page.mouse.move(searchBox.x + 20, searchBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(searchBox.x + 70, searchBox.y + 60)
  await page.mouse.up()
  expect(await canvasCamera(page)).not.toEqual(initial)
  await page.getByRole('button', { name: '退出手形', exact: true }).click()
})
test('canvas insertion follows the current viewport and publishing a default is one undoable document action', async ({
  page,
  request,
}) => {
  await setupCanvas(page, request)
  await page.getByRole('button', { name: '手形工具', exact: true }).click()
  const box = (await page.locator('.canvas-grid').boundingBox())!
  await page.mouse.move(box.x + 40, box.y + 30)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 40, box.y + box.height - 30)
  await page.mouse.up()
  await page.getByRole('button', { name: '退出手形', exact: true }).click()
  await edit(page)
  await page.locator('.floating-panel').hover()
  await page.locator('.panel-actions button').filter({ hasText: '☰' }).click()
  await page.locator('.widget-item').filter({ hasText: '时钟' }).click()
  await expect(page.locator('.canvas-item')).toHaveCount(3)
  await expect
    .poll(
      async () => (await (await request.get(backend + '/api/dashboards')).json()).widgets.length,
    )
    .toBe(3)
  const latest = page.locator('.canvas-item').last(),
    itemBox = (await latest.boundingBox())!,
    view = (await page.locator('.canvas-grid').boundingBox())!
  expect(itemBox.x + itemBox.width / 2).toBeGreaterThan(view.x)
  expect(itemBox.x + itemBox.width / 2).toBeLessThan(view.x + view.width)
  expect(itemBox.y + itemBox.height / 2).toBeGreaterThan(view.y)
  expect(itemBox.y + itemBox.height / 2).toBeLessThan(view.y + view.height)
  await expect(page.getByRole('status')).toContainText('已同步')
  const before = await (await request.get(backend + '/api/dashboards')).json()
  await page.getByRole('button', { name: '放大画布' }).click()
  const camera = await canvasCamera(page)
  await page.getByRole('button', { name: '发布为默认视角', exact: true }).click()
  await expect
    .poll(async () => (await (await request.get(backend + '/api/dashboards')).json()).revision)
    .toBe(before.revision + 1)
  const published = await (await request.get(backend + '/api/dashboards')).json()
  expect(published.canvasSettings.defaultCamera.centerX).toBeCloseTo(camera.centerX, 6)
  expect(published.canvasSettings.defaultCamera.centerY).toBeCloseTo(camera.centerY, 6)
  expect(published.canvasSettings.defaultCamera.zoom).toBeCloseTo(camera.zoom, 6)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect
    .poll(
      async () => (await (await request.get(backend + '/api/dashboards')).json()).canvasSettings,
    )
    .toEqual(before.canvasSettings)
  expect(await canvasCamera(page)).toEqual(camera)
})

test('canvas pointer insertion drops at the release point and cancellation creates nothing', async ({
  page,
  request,
}) => {
  await setupCanvas(page, request)
  await edit(page)
  await page.locator('.floating-panel').hover()
  await page.locator('.panel-actions button').filter({ hasText: '☰' }).click()
  const source = page.locator('.widget-item').filter({ hasText: '时钟' })
  await source.hover()
  const s = (await source.boundingBox())!,
    v = (await page.locator('.canvas-grid').boundingBox())!
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  await page.mouse.down()
  await page.mouse.move(v.x + v.width / 2, v.y + v.height / 2, { steps: 5 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.locator('.canvas-item')).toHaveCount(2)
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  await page.mouse.down()
  await page.mouse.move(v.x + v.width / 2, v.y + v.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator('.canvas-item')).toHaveCount(3)
  const added = (await page.locator('.canvas-item').last().boundingBox())!
  expect(Math.abs(added.x + added.width / 2 - (v.x + v.width / 2))).toBeLessThan(21)
  expect(Math.abs(added.y + added.height / 2 - (v.y + v.height / 2))).toBeLessThan(21)
})
test('canvas gestures cancel on resize, lost pointer capture, blur and permission loss', async ({
  page,
  request,
}) => {
  await setupCanvas(page, request)
  await edit(page)
  const before = await (await request.get(backend + '/api/dashboards')).json()
  const handle = page.locator('.canvas-drag-handle').first()
  for (const reason of ['resize', 'cancel', 'blur', 'permission']) {
    const box = (await handle.boundingBox())!
    await page.mouse.move(box.x + 8, box.y + 8)
    await page.mouse.down()
    await page.mouse.move(box.x + 80, box.y + 40)
    if (reason === 'resize') await page.setViewportSize({ width: 1280, height: 800 })
    if (reason === 'cancel') await page.locator('.canvas-grid').dispatchEvent('pointercancel')
    if (reason === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    if (reason === 'permission')
      await page.evaluate(() => window.dispatchEvent(new Event('nav-auth-invalid')))
    await page.waitForTimeout(60)
    await page.mouse.up()
    expect((await (await request.get(backend + '/api/dashboards')).json()).widgets).toEqual(
      before.widgets,
    )
  }
  await expect(handle).toHaveCount(0)
})
test('touch blank pan and two-finger zoom use a fresh baseline without document writes', async ({
  page,
  request,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'CDP touch injection is Chromium-specific')
  await setupCanvas(page, request)
  await page.setViewportSize({ width: 600, height: 900 })
  await page.getByRole('button', { name: '手形工具', exact: true }).click()
  const client = await page.context().newCDPSession(page),
    v = (await page.locator('.canvas-grid').boundingBox())!
  const initial = await canvasCamera(page)
  const touch = (x: number, y: number, id: number) => ({ x, y, id, radiusX: 1, radiusY: 1 })
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [touch(100, v.y + 100, 1)],
  })
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [touch(140, v.y + 140, 1)],
  })
  await page.waitForTimeout(40)
  const panned = await canvasCamera(page)
  expect(panned.centerX).not.toBe(initial.centerX)
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [touch(140, v.y + 140, 1), touch(280, v.y + 140, 2)],
  })
  await page.waitForTimeout(40)
  expect(await canvasCamera(page)).toEqual(panned)
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [touch(100, v.y + 140, 1), touch(320, v.y + 140, 2)],
  })
  await page.waitForTimeout(40)
  expect((await canvasCamera(page)).zoom).toBeGreaterThan(panned.zoom)
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await client.detach()
})
test('100 lightweight canvas widgets keep their instances while panning and zooming', async ({
  page,
  request,
}, testInfo) => {
  await replaceDashboard(page, request, (d: any) => {
    d.layoutMode = 'canvas'
    d.canvasSettings = { version: 1, defaultCamera: { centerX: 0, centerY: 0, zoom: 1 } }
    const first = d.widgets[0]
    d.widgets = Array.from({ length: 100 }, (_, i) => ({
      ...first,
      id: `perf-clock-${i}`,
      canvas: { x: (i % 10) * 300, y: Math.floor(i / 10) * 200, w: 280, h: 180 },
    }))
  })
  await expect(page.locator('.canvas-item')).toHaveCount(100)
  const sample = await page.evaluate(async () => {
    const elements = [...document.querySelectorAll('.clock-widget')],
      times: number[] = []
    let previous = performance.now()
    for (let i = 0; i < 60; i++) {
      document
        .querySelector('.canvas-background')!
        .dispatchEvent(
          new WheelEvent('wheel', { deltaX: 10, deltaY: 10, bubbles: true, cancelable: true }),
        )
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const now = performance.now()
      if (i > 5) times.push(now - previous)
      previous = now
    }
    times.sort((a, b) => a - b)
    return {
      p95: times[Math.floor(times.length * 0.95)],
      sameInstances: elements.every(
        (el, i) => el === document.querySelectorAll('.clock-widget')[i],
      ),
      userAgent: navigator.userAgent,
      cores: navigator.hardwareConcurrency,
    }
  })
  expect(sample.sameInstances).toBe(true)
  await testInfo.attach('canvas-100-widget-frame-sample', {
    body: JSON.stringify(sample, null, 2),
    contentType: 'application/json',
  })
})
