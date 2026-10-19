import { test, expect, type Page } from '../helpers/browserTest'
import {
  backend,
  canvasFixture,
  isolateServices,
  login,
  saveFixture,
  installFixturePlugin,
} from '../helpers/runtimeFixture'
test.use({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } })
let token = ''
const errors = new WeakMap<Page, string[]>()
test.beforeAll(async ({ request }) => {
  token = await login(request)
})
test.beforeEach(async ({ page, request }) => {
  errors.set(page, [])
  page.on('pageerror', (e) => errors.get(page)!.push(e.message))
  const d = canvasFixture()
  d.widgets[0].widgetId = 'chat'
  d.widgets[1].widgetId = 'search'
  d.widgets[2].widgetId = 'bookmark'
  d.canvasScene!.widgetMeta['runtime-24'].title = 'Remote clock'
  await saveFixture(request, token, d)
  await isolateServices(page, token)
  await page.goto('/')
  await expect(page.locator('.canvas-item')).toHaveCount(25)
  await expect(page.locator('.chat-widget')).toBeVisible()
  await expect(page.locator('.search-widget')).toBeVisible()
  await expect(page.locator('.bookmark-widget')).toBeVisible()
  await expect(page.locator('.widget-renderer[data-view-ready="false"]')).toHaveCount(0)
})
test.afterEach(async ({ page }) => {
  expect(errors.get(page) ?? []).toEqual([])
})
async function pan(page: Page, dx: number) {
  await page.locator('.canvas-grid').focus()
  await page
    .locator('.canvas-background')
    .evaluate(
      (el, deltaX) =>
        el.dispatchEvent(
          new WheelEvent('wheel', { deltaX, deltaY: 0, bubbles: true, cancelable: true }),
        ),
      dx,
    )
}
async function edit(page: Page) {
  await page.locator('.floating-panel').hover()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.locator('.floating-panel').hover()
  await page.locator('.panel-actions button').filter({ hasText: '✕' }).click()
}
test('safe mode delays offscreen detail, reclaims after grace, search mounts the complete target; modes and navigation never write', async ({
  page,
  request,
}) => {
  const before = await (await request.get(backend + '/api/dashboards')).json()
  const hosts = await page.locator('.canvas-item').elementHandles()
  await expect(page.locator('[data-widget-id="runtime-24"] .clock-widget')).toHaveCount(0)
  await page.getByRole('button', { name: '搜索画布', exact: true }).click()
  await page.getByLabel('搜索画布内容').fill('Remote clock')
  await page
    .getByRole('list', { name: '搜索结果' })
    .getByRole('button')
    .filter({ hasText: 'Remote clock' })
    .click()
  await expect(page.locator('[data-widget-id="runtime-24"] .clock-widget')).toBeVisible()
  await expect(page.locator('[data-widget-id="runtime-0"] .chat-widget')).toHaveCount(0)
  await page.getByRole('button', { name: '返回定位前视角' }).click()
  await expect(page.locator('.chat-widget')).toBeVisible()
  for (const mode of ['full', 'observe', 'safe']) {
    await page.getByLabel('画布资源模式').selectOption(mode)
    if (mode !== 'safe') await expect(page.locator('.widget-renderer')).toHaveCount(25)
  }
  for (let i = 0; i < hosts.length; i++)
    expect(
      await hosts[i].evaluate(
        (el, index) => el === document.querySelectorAll('.canvas-item')[index],
        i,
      ),
    ).toBe(true)
  expect((await (await request.get(backend + '/api/dashboards')).json()).revision).toBe(
    before.revision,
  )
})
test('draft and composition pin the same view, then recover draft after actual detach and reload', async ({
  page,
}) => {
  const input = page.getByPlaceholder('输入消息...'),
    original = await input.elementHandle()
  await input.fill('private draft')
  await input.dispatchEvent('compositionstart', { data: '中' })
  await page
    .locator('.canvas-background')
    .evaluate((el) =>
      el.dispatchEvent(new WheelEvent('wheel', { deltaX: 5000, bubbles: true, cancelable: true })),
    )
  await page.waitForTimeout(1700)
  expect(await original!.evaluate((el) => el.isConnected)).toBe(true)
  await input.dispatchEvent('compositionend', { data: '中' })
  await page.locator('.canvas-grid').focus()
  await expect(page.locator('.chat-widget')).toHaveCount(0)
  await page.getByRole('button', { name: '回到默认', exact: true }).click()
  await expect(input).toHaveValue('private draft')
  await page.reload()
  await page.getByRole('button', { name: '回到默认', exact: true }).click()
  await expect(input).toHaveValue('private draft')
})
test('stream stays single and continuous across offscreen/LOD/full fallback; reload restores interrupted fragments without resending', async ({
  page,
}) => {
  await page.evaluate(() => {
    const original = window.fetch
    Object.assign(window, { __chatSends: 0, __chatAborts: 0 })
    window.fetch = (async (url, init) => {
      if (!String(url).endsWith('/api/chat/stream')) return original(url, init)
      ;(window as any).__chatSends++
      return new Response(
        new ReadableStream({
          start(controller) {
            let n = 0
            const timer = setInterval(() => {
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content: `${++n},` } }] })}\n\n`,
                ),
              )
              if (n === 1000) {
                clearInterval(timer)
                controller.close()
              }
            }, 100)
            init?.signal?.addEventListener('abort', () => {
              ;(window as any).__chatAborts++
              clearInterval(timer)
              controller.error(new DOMException('Aborted', 'AbortError'))
            })
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    }) as typeof fetch
  })
  await page.getByPlaceholder('输入消息...').fill('one send')
  await page.getByTitle('发送', { exact: true }).click()
  await expect(page.locator('.message.assistant')).toContainText('1,')
  await page.route('**/api/auth/verify', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.fulfill({ json: { valid: true } })
  })
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await page.waitForTimeout(700)
  expect(await page.evaluate(() => (window as any).__chatAborts)).toBe(0)
  await pan(page, 5000)
  await page.waitForTimeout(1700)
  await expect(page.locator('.chat-widget')).toHaveCount(1)
  expect(await page.evaluate(() => (window as any).__chatAborts)).toBe(0)
  for (const mode of ['full', 'safe']) await page.getByLabel('画布资源模式').selectOption(mode)
  await page.getByRole('button', { name: '回到默认', exact: true }).click()
  await expect(page.locator('.message.assistant')).toContainText('1,2,3,4,5,')
  expect(await page.evaluate(() => (window as any).__chatSends)).toBe(1)
  const text = await page.locator('.message.assistant .msg-content').innerText()
  await page.reload()
  await page.getByRole('button', { name: '回到默认', exact: true }).click()
  await expect(page.locator('.chat-widget')).toBeVisible()
  await expect(page.locator('.message.assistant .msg-content')).toContainText(text)
  await expect(page.getByRole('alert')).toContainText('中断')
  await expect(page.getByTitle('停止', { exact: true })).toHaveCount(0)
})
test('bookmark config remains pinned with unsubmitted fields, closing permits recycling and leaves document unchanged', async ({
  page,
  request,
}) => {
  await page.getByRole('button', { name: '搜索画布', exact: true }).click()
  await page.getByLabel('搜索画布内容').fill('书签')
  await page.getByRole('list', { name: '搜索结果' }).getByRole('button').first().click()
  await page.getByRole('button', { name: '关闭面板' }).click()
  await page.locator('.bookmark-widget .empty-config').click()
  await page.getByPlaceholder('分组名称').fill('unsaved private group')
  const before = await (await request.get(backend + '/api/dashboards')).json()
  await pan(page, 5000)
  await page.waitForTimeout(1700)
  await expect(page.getByPlaceholder('分组名称')).toHaveValue('unsaved private group')
  // The form is protected even though it is geometrically offscreen; restore camera to interact.
  await page.getByRole('button', { name: '适应全部', exact: true }).click()
  await page.getByRole('button', { name: '取消', exact: true }).click({ force: true })
  expect((await (await request.get(backend + '/api/dashboards')).json()).revision).toBe(
    before.revision,
  )
})
test('deleting a chat and undoing restores stopped private draft, never reissues a user request', async ({
  page,
}) => {
  await page.getByPlaceholder('输入消息...').fill('undo private draft')
  await edit(page)
  let sends = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/api/chat/stream')) sends++
  })
  for (let cycle = 0; cycle < 20; cycle++) {
    await page.locator('[data-widget-id="runtime-0"] .remove-btn').click()
    await expect(page.locator('[data-widget-id="runtime-0"]')).toHaveCount(0)
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(page.getByPlaceholder('输入消息...')).toHaveValue('undo private draft')
  }
  expect(sends).toBe(0)
})
test('old plugin iframe and private input survive 20 camera/LOD cycles and full fallback', async ({
  page,
  request,
}) => {
  await installFixturePlugin(request, token)
  const d = canvasFixture(2)
  d.widgets[0].source = 'installed'
  d.widgets[0].widgetId = 'perf-plugin'
  await saveFixture(request, token, d)
  await page.reload()
  const frame = page.frameLocator('iframe')
  await frame.getByPlaceholder('plugin draft').fill('iframe retained')
  const original = await page.locator('iframe').elementHandle(),
    source = await page.locator('iframe').getAttribute('srcdoc')
  for (let i = 0; i < 20; i++) {
    await pan(page, i % 2 === 0 ? 5000 : -5000)
  }
  await page.getByRole('button', { name: '适应全部', exact: true }).click()
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: '缩小画布' }).click()
  await page.waitForTimeout(1700)
  expect(await original!.evaluate((el) => el === document.querySelector('iframe'))).toBe(true)
  expect(await page.locator('iframe').getAttribute('srcdoc')).toBe(source)
  await page.getByLabel('画布资源模式').selectOption('full')
  await expect(frame.getByPlaceholder('plugin draft')).toHaveValue('iframe retained')
})
test('20 viewport cycles leave one owner per model, no orphan View attachments and clock demand matches visible detail', async ({
  page,
  request,
}) => {
  const before = await (await request.get(backend + '/api/dashboards')).json()
  for (let i = 0; i < 20; i++) await pan(page, i % 2 === 0 ? 1000 : -1000)
  await page.getByRole('button', { name: '回到默认', exact: true }).click()
  await page.waitForTimeout(1800)
  await expect(page.locator('.canvas-item')).toHaveCount(25)
  expect(await page.locator('.widget-renderer').count()).toBeLessThan(25)
  if (process.env.NAV_TEST_DIST !== 'true') {
    const snapshot = await page.evaluate(
      () =>
        new Promise<Record<string, any>>((resolve) => {
          window.addEventListener(
            'nav-runtime-snapshot',
            (e) => resolve((e as CustomEvent).detail),
            { once: true },
          )
          window.dispatchEvent(new Event('nav-runtime-diagnostics'))
        }),
    )
    expect(snapshot.owners).toBe(25)
    expect(snapshot.views).toBe(await page.locator('.widget-renderer').count())
    expect(snapshot.clock.subscribers).toBe(await page.locator('.clock-widget:visible').count())
    expect(snapshot.protectedWidgets).toBe(0)
    expect(snapshot.tombstones).toBe(0)
    expect(JSON.stringify(snapshot)).not.toContain('private')
  }
  expect((await (await request.get(backend + '/api/dashboards')).json()).revision).toBe(
    before.revision,
  )
})
