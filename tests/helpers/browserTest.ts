import { test as base } from '@playwright/test'
export * from '@playwright/test'
/** Hermetic by default: only the isolated local application may reach the network.
 * Page-specific service/plugin fixtures take precedence over this context route.
 * Unstubbed favicons, weather, AI and plugin endpoints are always aborted.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (
        ['http:', 'https:'].includes(url.protocol) &&
        ['127.0.0.1', 'localhost'].includes(url.hostname)
      )
        await route.continue()
      else await route.abort('blockedbyclient')
    })
    await use(context)
  },
})
