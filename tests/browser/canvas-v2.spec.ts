import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import {
  createDashboard,
  initialScene,
  applyCanvasCommand,
  type Dashboard,
} from '../../packages/shared/src/index'
test.use({ serviceWorkers: 'block' })
const backend = process.env.NAV_TEST_API ?? 'http://127.0.0.1:4000'
let token = ''
const errors = new WeakMap<Page, string[]>()
const snapshot = async (request: APIRequestContext): Promise<Dashboard> =>
  (await request.get(backend + '/api/dashboards')).json()
async function put(request: APIRequestContext, d: Dashboard) {
  const current = await snapshot(request),
    response = await request.put(backend + '/api/dashboards/default/state', {
      headers: { Authorization: `Bearer ${token}`, 'If-Match': String(current.revision) },
      data: {
        schemaVersion: 3,
        operationId: crypto.randomUUID(),
        snapshot: { ...d, instanceId: current.instanceId },
      },
    })
  expect(response.ok(), await response.text()).toBeTruthy()
  return response.json()
}
async function unlock(request: APIRequestContext) {
  const d = await snapshot(request)
  let changed = false
  for (const m of Object.values(d.canvasScene?.widgetMeta ?? {})) {
    if (m.locked) changed = true
    m.locked = false
  }
  for (const m of [...(d.canvasScene?.groups ?? []), ...(d.canvasScene?.regions ?? [])]) {
    if (m.locked) changed = true
    m.locked = false
  }
  if (changed) await put(request, d)
}
test.beforeAll(async ({ request }) => {
  const r = await request.post(backend + '/api/auth/login', {
    data: { password: process.env.NAV_TEST_PASSWORD ?? 'browser-test-password' },
  })
  token = (await r.json()).token
})
test.beforeEach(async ({ page, request }) => {
  errors.set(page, [])
  page.on('pageerror', (e) => errors.get(page)!.push(e.message))
  await unlock(request)
  const d = createDashboard(),
    l = { x: 0, y: 0, w: 3, h: 3 }
  d.layoutMode = 'canvas'
  d.canvasSettings = { version: 1, defaultCamera: { centerX: 420, centerY: 200, zoom: 0.8 } }
  d.widgets = ['one', 'two', 'three'].map((id, i) => ({
    id,
    widgetId: i === 0 ? 'chat' : 'clock',
    source: 'builtin',
    config: {},
    layouts: { lg: { ...l, x: i * 3 }, md: l, sm: l, xs: l },
    canvas: { x: i * 330, y: 20 + i * 20, w: 280, h: 250 },
  }))
  d.canvasScene = initialScene(d.widgets.map((w) => w.id))
  await put(request, d)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.addInitScript((token) => {
    if (window === window.top) localStorage.setItem('nav_token', token)
  }, token)
  await page.goto('/')
  await expect(page.locator('.canvas-item')).toHaveCount(3)
})
test.afterEach(async ({ page, request }) => {
  expect(errors.get(page) ?? []).toEqual([])
  await unlock(request)
})
async function edit(page: Page) {
  await page.locator('.floating-panel').hover()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.locator('.floating-panel').hover()
  await page.locator('.panel-actions button').filter({ hasText: '✕' }).click()
  await expect(page.getByRole('button', { name: '选择工具', exact: true })).toBeVisible()
}
async function selectTwo(page: Page) {
  await page.getByRole('button', { name: '选择工具', exact: true }).click()
  await page.locator('[data-widget-id="one"] .widget-select-cover').click()
  await page.locator('[data-widget-id="two"] .widget-select-cover').click({ modifiers: ['Shift'] })
  await expect(page.locator('.canvas-item.selected')).toHaveCount(2)
}
test('V2 group, order, lock and ungroup preserve hosts and chat draft, one command creates one revision', async ({
  page,
  request,
}) => {
  const chat = page.locator('.chat-widget input, .chat-widget textarea').first()
  await chat.fill('temporary draft')
  await page
    .locator('.canvas-item')
    .evaluateAll((nodes) => nodes.forEach((n, i) => ((n as any).__v2identity = i + 1)))
  await edit(page)
  await selectTwo(page)
  const before = await snapshot(request)
  await page.getByRole('button', { name: '分组', exact: true }).click()
  await expect.poll(async () => (await snapshot(request)).canvasScene!.groups.length).toBe(1)
  expect((await snapshot(request)).revision).toBe(before.revision! + 1)
  await page.getByRole('button', { name: '置顶', exact: true }).click()
  await expect
    .poll(async () => (await snapshot(request)).canvasScene!.layers.at(-1)!.kind)
    .toBe('group')
  await page.getByRole('button', { name: '锁定所选', exact: true }).click()
  await expect.poll(async () => (await snapshot(request)).canvasScene!.groups[0].locked).toBe(true)
  const locked = await snapshot(request)
  await expect(page.getByRole('button', { name: '删除所选及组内组件', exact: true })).toBeDisabled()
  expect((await snapshot(request)).revision).toBe(locked.revision)
  await page.getByRole('button', { name: '解锁所选', exact: true }).click()
  await expect.poll(async () => (await snapshot(request)).canvasScene!.groups[0].locked).toBe(false)
  await page.getByRole('button', { name: '解组', exact: true }).click()
  await expect.poll(async () => (await snapshot(request)).canvasScene!.groups.length).toBe(0)
  await page.getByRole('button', { name: '进入组件', exact: true }).click()
  expect(
    await page
      .locator('.canvas-item')
      .evaluateAll((nodes) => nodes.map((n) => (n as any).__v2identity)),
  ).toEqual([1, 2, 3])
  await expect(chat).toHaveValue('temporary draft')
})
test('V2 common movement and Escape cancel use one atomic geometry commit with stable offsets', async ({
  page,
  request,
}) => {
  await edit(page)
  await selectTwo(page)
  await page.getByRole('button', { name: '吸附', exact: true }).click()
  const before = await snapshot(request),
    cover = page.locator('[data-widget-id="one"] .widget-select-cover'),
    b = (await cover.boundingBox())!
  await page.mouse.move(b.x + 70, b.y + 70)
  await page.mouse.down()
  await page.mouse.move(b.x + 119, b.y + 101)
  await page.mouse.up()
  await expect.poll(async () => (await snapshot(request)).revision).toBe(before.revision! + 1)
  const moved = await snapshot(request)
  expect(moved.widgets[1].canvas!.x - moved.widgets[0].canvas!.x).toBe(330)
  expect(moved.widgets[1].canvas!.y - moved.widgets[0].canvas!.y).toBe(20)
  const after = (await cover.boundingBox())!
  await page.mouse.move(after.x + 70, after.y + 70)
  await page.mouse.down()
  await page.mouse.move(after.x + 150, after.y + 110)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect((await snapshot(request)).widgets).toEqual(moved.widgets)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect
    .poll(async () => (await snapshot(request)).widgets.map((w) => w.canvas))
    .toEqual(before.widgets.map((w) => w.canvas))
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect
    .poll(async () => (await snapshot(request)).widgets.map((w) => w.canvas))
    .toEqual(moved.widgets.map((w) => w.canvas))
})
test('V2 search and local named view CRUD navigate without document writes and preserve mounted widgets', async ({
  page,
  request,
}) => {
  const before = await snapshot(request)
  await page
    .locator('.canvas-item')
    .evaluateAll((nodes) => nodes.forEach((n) => ((n as any).__stillMounted = true)))
  await page.getByRole('button', { name: '搜索画布', exact: true }).click()
  await page.getByRole('textbox', { name: '搜索画布内容' }).fill('时钟')
  await expect(page.getByLabel('搜索结果').locator('li')).toHaveCount(2)
  await page.getByLabel('搜索结果').getByRole('button').first().click()
  await page.getByRole('button', { name: '关闭面板', exact: true }).click()
  await page.getByRole('button', { name: '我的视角', exact: true }).click()
  await page.getByRole('textbox', { name: '视角名称', exact: true }).fill('Desk')
  await page.getByRole('button', { name: '保存当前视角', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Desk', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '改名', exact: true }).click()
  await page.getByRole('textbox', { name: '新视角名称', exact: true }).fill('Work')
  await page.getByRole('button', { name: '保存名称', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Work', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Work', exact: true }).click()
  await page.getByRole('button', { name: '删除视角', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Work', exact: true })).toHaveCount(0)
  expect((await snapshot(request)).revision).toBe(before.revision)
  expect(
    await page
      .locator('.canvas-item')
      .evaluateAll((nodes) => nodes.every((n) => (n as any).__stillMounted)),
  ).toBe(true)
})
test('V2 regions remain background annotations and group layer changes preserve a sandbox iframe runtime', async ({
  page,
  request,
}) => {
  const commit = 'a'.repeat(40),
    widgetId = 'v2-lifecycle-test',
    url = `https://cdn.jsdelivr.net/gh/test/v2@${commit}/index.js`,
    manifest = {
      manifestVersion: 2,
      name: widgetId,
      displayName: 'V2 lifecycle',
      version: '1',
      entry: 'index.js',
      description: 'test',
      author: 'test',
      icon: '',
      repository: 'https://github.com/test/v2',
      schema: {},
      size: { w: 3, h: 3 },
      minSize: { w: 2, h: 2 },
      networkOrigins: [],
    }
  const catalog = await (await request.get(backend + '/api/installed-widgets/revision')).json()
  const installed = await request.post(backend + '/api/installed-widgets', {
    headers: {
      Authorization: `Bearer ${token}`,
      'If-Match': String(catalog.revision),
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: { widgetId, commit, cdnUrl: url, installedAt: new Date().toISOString(), manifest },
  })
  expect(installed.ok()).toBeTruthy()
  await page.route(url, (r) =>
    r.fulfill({
      body: "export function mount(el){const input=document.createElement('input');input.placeholder='runtime';el.append(input);return ()=>{};}",
      contentType: 'text/javascript',
      headers: { 'Access-Control-Allow-Origin': '*' },
    }),
  )
  let d = await snapshot(request)
  d.widgets[0] = { ...d.widgets[0], widgetId, source: 'installed' }
  await put(request, d)
  await page.reload()
  const input = page.frameLocator('iframe').getByPlaceholder('runtime')
  await expect(input).toBeVisible()
  await input.fill('iframe kept')
  await edit(page)
  await selectTwo(page)
  await page.getByRole('button', { name: '分组', exact: true }).click()
  await expect.poll(async () => (await snapshot(request)).canvasScene!.groups.length).toBe(1)
  await page.getByRole('button', { name: '框住所选', exact: true }).click()
  await expect.poll(async () => (await snapshot(request)).canvasScene!.regions.length).toBe(1)
  d = await snapshot(request)
  const region = d.canvasScene!.regions[0],
    original = d.widgets
  await put(
    request,
    applyCanvasCommand(d, {
      type: 'move',
      refs: [{ kind: 'region', id: region.id }],
      delta: { x: 100, y: 100 },
    }),
  )
  expect((await snapshot(request)).widgets).toEqual(original)
  await page.getByRole('button', { name: '进入组件', exact: true }).click()
  await expect(input).toHaveValue('iframe kept')
})

test('V2 region gesture creates once, moves and deletes only the annotation, and marquee selects content without writing', async ({
  page,
  request,
}) => {
  await edit(page)
  const before = await snapshot(request),
    box = (await page.locator('.canvas-grid').boundingBox())!
  await page.getByRole('button', { name: '区域工具', exact: true }).click()
  await page.mouse.move(box.x + 25, box.y + 25)
  await page.mouse.down()
  await page.mouse.move(box.x + 205, box.y + 145)
  await page.mouse.up()
  await expect.poll(async () => (await snapshot(request)).canvasScene!.regions.length).toBe(1)
  const created = await snapshot(request)
  expect(created.revision).toBe(before.revision! + 1)
  expect(created.widgets).toEqual(before.widgets)
  const title = page.getByRole('button', { name: '区域 新区域', exact: true }),
    r = (await title.boundingBox())!
  await page.mouse.move(r.x + 15, r.y + 10)
  await page.mouse.down()
  await page.mouse.move(r.x + 75, r.y + 50)
  await page.mouse.up()
  await expect.poll(async () => (await snapshot(request)).revision).toBe(created.revision! + 1)
  expect((await snapshot(request)).widgets).toEqual(before.widgets)
  await page.getByRole('button', { name: '图层', exact: true }).click()
  await page.getByRole('button', { name: '删除区域', exact: true }).click()
  await expect.poll(async () => (await snapshot(request)).canvasScene!.regions.length).toBe(0)
  await page.getByRole('button', { name: '关闭面板', exact: true }).click()
  const current = await snapshot(request)
  await page.getByRole('button', { name: '选择工具', exact: true }).click()
  await page.locator('.canvas-grid').focus()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
  await expect(page.locator('.canvas-item.selected')).toHaveCount(3)
  expect((await snapshot(request)).revision).toBe(current.revision)
})
