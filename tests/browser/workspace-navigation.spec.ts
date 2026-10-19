import { test, expect } from '../helpers/browserTest'
import { createDashboard, initialScene } from '../../packages/shared/src/index'

test.use({ serviceWorkers: 'block' })

test('workspace navigation stays visible and opens usable panels at desktop and narrow sizes', async ({
  page,
  request,
}) => {
  const backend = process.env.NAV_TEST_API ?? 'http://127.0.0.1:4000'
  const login = await request.post(backend + '/api/auth/login', {
    data: { password: process.env.NAV_TEST_PASSWORD ?? 'browser-test-password' },
  })
  expect(login.ok()).toBeTruthy()
  const { token } = await login.json()
  await page.addInitScript((value) => localStorage.setItem('nav_token', value), token)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  for (const mode of ['grid', 'canvas'] as const) {
    const current = await (await request.get(backend + '/api/dashboards')).json()
    const dashboard = createDashboard()
    dashboard.instanceId = current.instanceId
    dashboard.layoutMode = mode
    dashboard.widgets = Array.from({ length: 12 }, (_, index) => {
      const layout = { x: (index % 3) * 4, y: Math.floor(index / 3) * 3, w: 4, h: 3 }
      return {
        id: `clock-${index}`,
        widgetId: 'clock',
        source: 'builtin',
        config: {},
        layouts: { lg: layout, md: layout, sm: layout, xs: layout },
        canvas: { x: (index % 4) * 330, y: Math.floor(index / 4) * 300, w: 280, h: 250 },
      }
    })
    dashboard.canvasScene = initialScene(dashboard.widgets.map((widget) => widget.id))
    const response = await request.put(backend + '/api/dashboards/default/state', {
      headers: { Authorization: `Bearer ${token}`, 'If-Match': String(current.revision) },
      data: { schemaVersion: 3, operationId: crypto.randomUUID(), snapshot: dashboard },
    })
    expect(response.ok(), await response.text()).toBeTruthy()
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: '内容导航', exact: true })
    await expect(nav).toBeVisible()
    const before = await (await request.get(backend + '/api/dashboards')).json()
    for (const [width, height] of [
      [1920, 1080],
      [1366, 768],
      [1024, 768],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height })
      if (mode === 'grid') {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      }
      const layers = nav.getByRole('button', { name: '图层', exact: true })
      const bounds = await layers.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.y).toBeGreaterThanOrEqual(0)
      expect(bounds!.y + bounds!.height).toBeLessThan(height)
      await layers.click()
      await expect(layers).toHaveAttribute('aria-expanded', 'true')
      await expect(page.getByRole('complementary', { name: '图层面板' })).toBeVisible()
      await nav.getByRole('button', { name: '搜索画布', exact: true }).click()
      const search = page.getByRole('complementary', { name: '搜索面板' })
      const input = search.getByRole('textbox', { name: '搜索画布内容' })
      await expect(input).toBeFocused()
      await input.fill('时钟')
      await expect(search.getByRole('list', { name: '搜索结果' }).getByRole('button')).toHaveCount(
        12,
      )
      const panelBounds = await search.boundingBox()
      expect(panelBounds!.x).toBeGreaterThanOrEqual(0)
      expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(width)
      expect(panelBounds!.y).toBeGreaterThanOrEqual(0)
      expect(panelBounds!.y + panelBounds!.height).toBeLessThanOrEqual(height)
      await search.getByRole('button', { name: '关闭面板' }).click()
      await expect(search).toHaveCount(0)
      if (mode === 'canvas') {
        await nav.getByRole('button', { name: '我的视角', exact: true }).click()
        await expect(page.getByRole('complementary', { name: '我的视角' })).toBeVisible()
        await page.getByRole('button', { name: '关闭面板' }).click()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
    const after = await (await request.get(backend + '/api/dashboards')).json()
    expect(after.revision).toBe(before.revision)
    expect(after.widgets).toEqual(before.widgets)
  }
  expect(errors).toEqual([])
})
