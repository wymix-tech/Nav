import { test, expect } from '../helpers/browserTest'
import { login, isolateServices, saveFixture, backend } from '../helpers/runtimeFixture'
import { createDashboard, initialScene } from '../../packages/shared/src/index'

test.use({ serviceWorkers: 'block' })

test('seven builtin surfaces support both themes without changing widget content or geometry', async ({
  page,
  request,
}, testInfo) => {
  const token = await login(request)
  await isolateServices(page, token, 'full')
  for (const mode of ['grid', 'canvas'] as const) {
    for (const color of ['#0c1021', '#eef3fa']) {
      const d = createDashboard()
      d.layoutMode = mode
      d.background.color = color
      d.canvasSettings!.defaultCamera = { centerX: 520, centerY: 480, zoom: 1 }
      d.widgets = ['clock', 'search', 'bookmark', 'weather', 'monitor', 'docker', 'chat'].map(
        (widgetId, i) => {
          const l = { x: (i % 3) * 4, y: Math.floor(i / 3) * 4, w: 4, h: 4 }
          return {
            id: `appearance-${widgetId}`,
            widgetId,
            source: 'builtin',
            config:
              widgetId === 'docker'
                ? { containerName: 'fixture' }
                : widgetId === 'bookmark'
                  ? {
                      groups: [
                        {
                          name: '导航',
                          bookmarks: [{ title: '示例书签', url: 'https://example.com' }],
                        },
                      ],
                    }
                  : {},
            layouts: { lg: l, md: l, sm: l, xs: l },
            canvas: { x: (i % 3) * 350, y: Math.floor(i / 3) * 330, w: 330, h: 310 },
          }
        },
      )
      d.canvasScene = initialScene(d.widgets.map((w) => w.id))
      await saveFixture(request, token, d)
      await page.setViewportSize({ width: 1366, height: 1000 })
      await page.goto('/')
      await expect(page.locator('.weather-widget')).toContainText('Sunny')
      await expect(page.locator('.widget-wrapper[data-appearance=glass]')).toHaveCount(4)
      await expect(page.locator('.widget-wrapper[data-appearance=solid]')).toHaveCount(3)
      await page.screenshot({
        path: testInfo.outputPath(`${mode}-${color.slice(1)}.png`),
        fullPage: mode === 'grid',
      })
      await page.setViewportSize({ width: 390, height: 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({ path: testInfo.outputPath(`${mode}-${color.slice(1)}-390.png`) })
      const after = await (await request.get(backend + '/api/dashboards')).json()
      expect(after.widgets).toEqual(d.widgets)
    }
  }
})

test('global material and individual override persist, undo, cancel and keep mounted widgets', async ({
  page,
  request,
}) => {
  const token = await login(request)
  await isolateServices(page, token, 'full')
  const d = createDashboard()
  delete d.widgetAppearance
  const l = { x: 0, y: 0, w: 4, h: 3 }
  d.widgets = [
    {
      id: 'old-clock',
      widgetId: 'clock',
      source: 'builtin',
      config: {},
      layouts: { lg: l, md: l, sm: l, xs: l },
    },
  ]
  d.canvasScene = initialScene(['old-clock'])
  await saveFixture(request, token, d)
  await page.goto('/')
  const card = page.locator('.widget-wrapper')
  await expect(card).toHaveAttribute('data-appearance', 'legacy')
  await page.locator('.clock-widget').evaluate((el) => el.setAttribute('data-retained', 'yes'))
  await page.locator('.floating-panel').hover()
  await page.getByRole('button', { name: '偏好设置', exact: true }).click()
  const prefs = page.getByRole('dialog', { name: '偏好设置', exact: true })
  await prefs.getByLabel('组件外观', { exact: true }).selectOption('auto')
  await prefs.getByRole('button', { name: '保存', exact: true }).click()
  await expect(prefs).toHaveCount(0)
  await expect(card).toHaveAttribute('data-appearance', 'glass')
  await page.locator('.floating-panel').hover()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await card.hover()
  await card.getByRole('button', { name: '组件外观', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '组件外观', exact: true })
  await dialog.getByLabel('外观模式', { exact: true }).selectOption('solid')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(card).toHaveAttribute('data-appearance', 'solid')
  await expect(card).toHaveCSS('backdrop-filter', 'none')
  await expect(page.locator('.clock-widget')).toHaveAttribute('data-retained', 'yes')
  const saved = await (await request.get(backend + '/api/dashboards')).json()
  expect(saved.widgets[0].layouts).toEqual(d.widgets[0].layouts)
  expect(saved.widgets[0].config).toEqual({})
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(card).toHaveAttribute('data-appearance', 'glass')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(card).toHaveAttribute('data-appearance', 'solid')
  await card.hover()
  await card.getByRole('button', { name: '组件外观', exact: true }).click()
  await dialog.getByLabel('外观模式', { exact: true }).selectOption('none')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(card).toHaveAttribute('data-appearance', 'solid')
  await page.reload()
  await expect(card).toHaveAttribute('data-appearance', 'solid')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.floating-panel').hover()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await card.hover()
  await card.getByRole('button', { name: '组件外观', exact: true }).click()
  await dialog.getByLabel('外观模式', { exact: true }).selectOption('')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(card).toHaveAttribute('data-appearance', 'glass')
  await expect
    .poll(
      async () =>
        (await (await request.get(backend + '/api/dashboards')).json()).widgets[0].appearance,
    )
    .toBeUndefined()
})
