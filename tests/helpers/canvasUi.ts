import type { Page } from '@playwright/test'

export async function setResourceMode(page: Page, mode: string) {
  const trigger = page.getByRole('button', { name: '更多画布选项', exact: true })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
    await trigger.click()
  }
  await page.getByLabel('画布资源模式').selectOption(mode)
  await trigger.click()
}
