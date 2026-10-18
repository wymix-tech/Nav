import { test, expect } from '@playwright/test'
import { createDashboard } from '../../packages/shared/src/index'
test.use({ serviceWorkers: 'allow' })
test('production shell restores an offline canvas draft and independent camera, then synchronizes', async ({
  page,
  context,
  request,
}) => {
  test.skip(process.env.NAV_TEST_DIST !== 'true', 'Service Worker is generated only in production')
  const backend = process.env.NAV_TEST_API ?? 'http://127.0.0.1:4000'
  const login = await request.post(backend + '/api/auth/login', {
    data: { password: process.env.NAV_TEST_PASSWORD ?? 'browser-test-password' },
  })
  const { token } = await login.json()
  const current = await (await request.get(backend + '/api/dashboards')).json(),
    d = createDashboard(),
    layout = { x: 0, y: 0, w: 4, h: 3 }
  d.instanceId = current.instanceId
  d.layoutMode = 'canvas'
  d.widgets = [
    {
      id: 'offline-shell-clock',
      widgetId: 'clock',
      source: 'builtin',
      config: {},
      layouts: { lg: layout, md: layout, sm: layout, xs: layout },
      canvas: { x: 0, y: 0, w: 320, h: 200 },
    },
  ]
  expect(
    (
      await request.put(backend + '/api/dashboards/default/state', {
        headers: { Authorization: `Bearer ${token}`, 'If-Match': String(current.revision) },
        data: { schemaVersion: 2, snapshot: d, operationId: crypto.randomUUID() },
      })
    ).ok(),
  ).toBeTruthy()
  await page.addInitScript((token) => localStorage.setItem('nav_token', token), token)
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await expect(page.getByRole('button', { name: '恢复画布 100%' })).toBeVisible()
  await page.getByRole('button', { name: '放大画布' }).click()
  await expect(page.getByRole('button', { name: '恢复画布 100%' })).toHaveText('120%')
  await page.locator('.floating-panel').hover()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await context.setOffline(true)
  await page.locator('.canvas-drag-handle').focus()
  await page.locator('.canvas-drag-handle').press('ArrowRight')
  await expect(page.getByRole('status')).toContainText('本机')
  await expect(page.locator('.canvas-item')).toHaveCSS('left', '20px')
  await page.waitForTimeout(400)
  await page.reload()
  await expect(page.locator('.canvas-item')).toHaveCSS('left', '20px')
  await expect(page.locator('.clock-widget')).toBeVisible()
  await expect(page.getByRole('button', { name: '恢复画布 100%' })).toHaveText('120%')
  await context.setOffline(false)
  await page.reload()
  await expect
    .poll(
      async () =>
        (await (await request.get(backend + '/api/dashboards')).json()).widgets[0].canvas.x,
    )
    .toBe(20)
})
