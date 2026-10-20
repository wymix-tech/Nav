import { test, expect } from '../helpers/browserTest'
import { createDashboard } from '../../packages/shared/src/index'

test.use({ serviceWorkers: 'block' })

test('settings remain usable in both themes, layouts and narrow viewports', async ({
  page,
  request,
}, testInfo) => {
  const backend = process.env.NAV_TEST_API ?? 'http://127.0.0.1:4000'
  const login = await request.post(backend + '/api/auth/login', {
    data: { password: process.env.NAV_TEST_PASSWORD ?? 'browser-test-password' },
  })
  expect(login.ok()).toBeTruthy()
  const { token } = await login.json()
  await page.addInitScript((value) => localStorage.setItem('nav_token', value), token)
  for (const mode of ['grid', 'canvas'] as const) {
    for (const color of ['#0c1021', '#eef3fa']) {
      const current = await (await request.get(backend + '/api/dashboards')).json()
      const dashboard = createDashboard()
      dashboard.instanceId = current.instanceId
      dashboard.layoutMode = mode
      dashboard.background = { mode: 'color', color, images: [], interval: 30, index: 0 }
      const response = await request.put(backend + '/api/dashboards/default/state', {
        headers: { Authorization: `Bearer ${token}`, 'If-Match': String(current.revision) },
        data: { schemaVersion: 3, operationId: crypto.randomUUID(), snapshot: dashboard },
      })
      expect(response.ok(), await response.text()).toBeTruthy()
      await page.goto('/')
      await expect(page.getByRole('navigation', { name: '内容导航', exact: true })).toBeVisible()
      for (const [width, height] of [
        [1366, 768],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height })
        await page.locator('.floating-panel').hover()
        await page.locator('.panel-actions button').filter({ hasText: '⚙' }).click()
        const dialog = page.getByRole('dialog', { name: '偏好设置', exact: true })
        await expect(dialog).toBeVisible()
        await expect(
          dialog.getByRole('button', { name: '关闭偏好设置', exact: true }),
        ).toBeFocused()
        const bounds = await dialog.boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
        expect(bounds!.height).toBeLessThanOrEqual(height - 32)
        await expect(dialog.getByRole('button', { name: '纯色', exact: true })).toHaveAttribute(
          'aria-pressed',
          'true',
        )
        await page.screenshot({
          path: testInfo.outputPath(`${mode}-${color.slice(1)}-${width}.png`),
        })
        await dialog.getByLabel('页面标题', { exact: true }).fill('未保存的标题')
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        await expect(dialog).toHaveCount(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
      }
      const after = await (await request.get(backend + '/api/dashboards')).json()
      expect(after.revision).toBe(current.revision + 1)
      expect(after.title).toBe(dashboard.title)
    }
  }
})
