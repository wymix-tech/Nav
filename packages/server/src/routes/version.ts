import { Hono } from 'hono'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const version = new Hono()
version.get('/version', (c) => {
  const dir = dirname(fileURLToPath(import.meta.url))
  for (const path of [
    resolve(process.cwd(), '__APP_VERSION__'),
    resolve(dir, '../../__APP_VERSION__'),
    resolve(dir, '../../../../__APP_VERSION__'),
  ]) {
    try {
      const v = readFileSync(path, 'utf8').trim()
      if (/^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(v)) return c.json({ version: v })
    } catch {
      /* try next installation path */
    }
  }
  return c.json({ version: 'v0.1.0' })
})
let cached: { tag_name: string; body: string; html_url: string } | undefined
let until = 0
let pending: Promise<typeof cached> | undefined
version.get('/latest-release', async (c) => {
  if (Date.now() >= until) {
    pending ??= (async () => {
      try {
        // Fixed upstream: clients cannot turn this endpoint into a general HTTP proxy.
        const github = process.env.NAV_RELEASE_SOURCE === 'github'
        const response = await fetch(
          github
            ? 'https://api.github.com/repos/wymix-tech/Nav/releases/latest'
            : 'https://api.cnb.cool/wymix.top/nav/-/releases/latest',
          {
            headers: github
              ? { Accept: 'application/vnd.github+json' }
              : {
                  Accept: 'application/vnd.cnb.api+json',
                  ...(process.env.NAV_CNB_TOKEN
                    ? { Authorization: `Bearer ${process.env.NAV_CNB_TOKEN}` }
                    : {}),
                },
            signal: AbortSignal.timeout(5000),
            redirect: 'error',
          },
        )
        if (response.ok && Number(response.headers.get('Content-Length') ?? 0) <= 262144) {
          const text = await response.text()
          if (text.length <= 262144) {
            const data = JSON.parse(text)
            if (typeof data.tag_name === 'string' && typeof data.body === 'string')
              cached = {
                tag_name: data.tag_name.slice(0, 100),
                body: data.body.slice(0, 32000),
                html_url: github
                  ? 'https://github.com/wymix-tech/Nav/releases'
                  : 'https://cnb.cool/wymix.top/nav/-/releases',
              }
          }
        }
      } catch {
        /* retain last successful release while offline */
      }
      until = Date.now() + 300000
      return cached
    })().finally(() => {
      pending = undefined
    })
    await pending
  }
  return cached
    ? c.json(cached)
    : c.json({ error: { code: 'RELEASE_UNAVAILABLE', message: '暂时无法获取发布信息' } }, 503)
})
export default version
