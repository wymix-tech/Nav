import { test, expect } from '../helpers/browserTest'
import { login, saveFixture } from '../helpers/runtimeFixture'
import { createDashboard, initialScene } from '../../packages/shared/src/index'

test.use({ serviceWorkers: 'block' })

test('expanded canvas controls contain every action and search focus clears adjacent content', async ({
  page,
  request,
}, testInfo) => {
  const token = await login(request)
  await page.addInitScript((value) => localStorage.setItem('nav_token', value), token)
  const d = createDashboard()
  d.layoutMode = 'canvas'
  await saveFixture(request, token, d)
  await page.goto('/')
  await page.locator('.floating-panel').hover()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  for (const [width, height] of [
    [1366, 768],
    [768, 844],
    [390, 844],
    [320, 640],
  ]) {
    await page.setViewportSize({ width, height })
    await page.locator('.floating-panel').hover()
    const content = page.locator('.panel-content')
    await expect(content).toBeVisible()
    // Opacity and transform animate; evaluate the settled geometry.
    await expect(content).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
    const bounds = (await content.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    for (const action of await content.getByRole('button').all()) {
      const box = (await action.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(bounds.x)
      expect(box.y).toBeGreaterThanOrEqual(bounds.y)
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width)
      expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height)
    }
    await page.screenshot({ path: testInfo.outputPath(`expanded-${width}.png`) })
    await page.getByRole('button', { name: '搜索画布', exact: true }).click()
    const panel = page.getByRole('complementary', { name: '搜索面板' })
    const input = panel.getByRole('textbox', { name: '搜索画布内容' })
    await expect(input).toBeFocused()
    const box = (await input.boundingBox())!
    const close = (await panel
      .getByRole('button', { name: '关闭面板', exact: true })
      .boundingBox())!
    const hint = (await panel
      .getByText('仅搜索此仪表盘已加载的公开字段', { exact: true })
      .boundingBox())!
    const extension = await input.evaluate((el) => {
      const style = getComputedStyle(el)
      return Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset))
    })
    expect(box.y - extension).toBeGreaterThanOrEqual(close.y + close.height + 6)
    expect(box.y + box.height + extension + 6).toBeLessThanOrEqual(hint.y)
    await page.screenshot({ path: testInfo.outputPath(`search-focus-${width}.png`) })
    await panel.getByRole('button', { name: '关闭面板', exact: true }).click()
  }
})

test('clear material preserves patterned wallpaper in both themes and respects reduced transparency', async ({
  page,
  request,
}, testInfo) => {
  const token = await login(request)
  await page.addInitScript((value) => localStorage.setItem('nav_token', value), token)
  const d = createDashboard()
  d.layoutMode = 'canvas'
  const l = { x: 0, y: 0, w: 4, h: 3 }
  d.widgets = [
    {
      id: 'clear-clock',
      widgetId: 'clock',
      source: 'builtin',
      config: {},
      layouts: { lg: l, md: l, sm: l, xs: l },
      canvas: { x: 0, y: 0, w: 450, h: 250 },
    },
  ]
  d.canvasScene = initialScene(['clear-clock'])
  await saveFixture(request, token, d)
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/')
  const card = page.locator('.widget-wrapper[data-appearance="glass"]')
  await expect(card).toBeVisible()
  await page.addStyleTag({
    content: `.app { background-image: repeating-linear-gradient(35deg, #ffffff30 0 3px, transparent 3px 40px), linear-gradient(120deg, #264869, #a3b9bf 48%, #245653) !important; }`,
  })
  for (const theme of ['dark', 'light']) {
    await page.evaluate((light) => {
      document.documentElement.classList.toggle('light-theme', light)
      document.querySelector('.app')!.classList.toggle('light-theme', light)
    }, theme === 'light')
    await expect(card).toHaveCSS(
      'background-color',
      theme === 'light' ? 'rgba(255, 255, 255, 0.13)' : 'rgba(12, 20, 32, 0.16)',
    )
    const material = await card.evaluate((el) => {
      const s = getComputedStyle(el)
      return { background: s.backgroundColor, filter: s.backdropFilter }
    })
    expect(parseFloat(material.background.split(',')[3])).toBeLessThan(0.2)
    expect(material.filter).toContain('blur(3px)')
    await page.screenshot({ path: testInfo.outputPath(`clear-wallpaper-${theme}.png`) })
  }
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  })
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches),
  ).toBe(true)
  await expect(card).toHaveCSS('backdrop-filter', 'none')
  await expect(page.locator('.canvas-controls')).toHaveCSS('backdrop-filter', 'none')
})
