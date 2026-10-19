import { test, expect } from './helpers/browserTest'
import { createHash } from 'node:crypto'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { cpus, platform, release } from 'node:os'
import { execFileSync } from 'node:child_process'
import {
  backend,
  canvasFixture,
  isolateServices,
  login,
  saveFixture,
  installFixturePlugin,
} from './helpers/runtimeFixture'
test.use({ serviceWorkers: 'block', viewport: { width: 1920, height: 1200 } })
const mode = process.env.NAV_PERF_MODE ?? 'safe'
for (const scenario of ['dense-clock', 'sparse-clock', 'mixed'] as const)
  test(`production ${mode} ${scenario}: three rounds of 300 RAF with raw samples`, async ({
    page,
    request,
    browser,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const token = await login(request),
      mixed = scenario === 'mixed'
    if (mixed) await installFixturePlugin(request, token)
    const seeded = await saveFixture(
      request,
      token,
      canvasFixture(100, mixed, scenario === 'dense-clock'),
    )
    await isolateServices(page, token, mode)
    let writes = 0
    const requests: Record<string, number> = {}
    page.on('request', (r) => {
      if (r.method() === 'PUT') writes++
      const key = r
        .url()
        .replace(/^.*\/api\//, '')
        .replace(/\?.*/, '')
      if (
        r.url().includes('/api/system/') ||
        r.url().includes('/api/chat/') ||
        r.url().includes('wttr.in')
      )
        requests[key] = (requests[key] ?? 0) + 1
    })
    await page.goto('/')
    await page.addStyleTag({
      content:
        '.canvas-workspace { flex:none !important; width:1600px !important; height:900px !important; } .canvas-grid { flex:none !important; width:1600px !important; height:900px !important; }',
    })
    await expect(page.locator('.canvas-grid')).toHaveCSS('height', '900px')
    await expect(page.locator('.canvas-grid')).toHaveCSS('width', '1600px')
    await expect(page.locator('.canvas-item')).toHaveCount(100)
    await expect(page.locator('.canvas-content')).toHaveCSS('visibility', 'visible')
    await page.waitForTimeout(2000)
    const hosts = await page.locator('.canvas-item').elementHandles()
    const rounds = []
    for (let round = 0; round < 3; round++) {
      await page.getByRole('button', { name: '回到默认', exact: true }).click()
      await page.waitForTimeout(1700)
      rounds.push(
        await page.evaluate(async (mixed) => {
          const samples: number[] = [],
            warmup: number[] = [],
            longTasks: number[] = []
          const observer = PerformanceObserver.supportedEntryTypes.includes('longtask')
            ? new PerformanceObserver((list) => {
                for (const e of list.getEntries()) longTasks.push(e.duration)
              })
            : null
          observer?.observe({ entryTypes: ['longtask'] })
          let previous = performance.now()
          for (let i = 0; i < 330; i++) {
            if (mixed && (i === 130 || i === 230)) {
              for (let jump = 0; jump < (i === 130 ? 4 : 2); jump++)
                document.querySelector('.canvas-background')!.dispatchEvent(
                  new WheelEvent('wheel', {
                    deltaY: i === 130 ? 900 : 750,
                    bubbles: true,
                    cancelable: true,
                  }),
                )
            }
            const delta = i % 120 < 60 ? 18 : -18
            document.querySelector('.canvas-background')!.dispatchEvent(
              new WheelEvent('wheel', {
                deltaX: delta,
                deltaY: delta / 2,
                bubbles: true,
                cancelable: true,
              }),
            )
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            const now = performance.now()
            ;(i < 30 ? warmup : samples).push(now - previous)
            previous = now
          }
          if (observer) for (const entry of observer.takeRecords()) longTasks.push(entry.duration)
          observer?.disconnect()
          const sorted = [...samples].sort((a, b) => a - b),
            p = (q: number) => sorted[Math.floor(sorted.length * q)]
          return {
            samples,
            warmup,
            longTasks: observer ? longTasks : null,
            p50: p(0.5),
            p95: p(0.95),
            p99: p(0.99),
            hosts: document.querySelectorAll('.canvas-item').length,
            details: document.querySelectorAll('.widget-renderer').length,
            iframes: document.querySelectorAll('iframe').length,
          }
        }, mixed),
      )
    }
    for (let i = 0; i < hosts.length; i++)
      expect(
        await hosts[i].evaluate(
          (el, index) => el === document.querySelectorAll('.canvas-item')[index],
          i,
        ),
      ).toBe(true)
    expect(writes).toBe(0)
    expect(errors).toEqual([])
    expect((await (await request.get(backend + '/api/dashboards')).json()).revision).toBe(
      seeded.revision,
    )
    const environment = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      cores: navigator.hardwareConcurrency,
      viewport: { width: innerWidth, height: innerHeight },
      devicePixelRatio,
      canvasViewport: {
        width: document.querySelector('.canvas-grid')!.clientWidth,
        height: document.querySelector('.canvas-grid')!.clientHeight,
      },
      gpu: (() => {
        const gl = document.createElement('canvas').getContext('webgl')
        const ext = gl?.getExtension('WEBGL_debug_renderer_info')
        return ext ? gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null
      })(),
    }))
    mkdirSync('docs/performance', { recursive: true })
    writeFileSync(
      `docs/performance/${mode}-${scenario}.json`,
      JSON.stringify(
        {
          mode,
          scenario,
          sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
          sourceDirty: !!execFileSync('git', ['status', '--porcelain', '--', 'packages'], {
            encoding: 'utf8',
          }).trim(),
          harnessHash: createHash('sha256')
            .update(readFileSync('tests/performance.spec.ts'))
            .update(readFileSync('tests/helpers/runtimeFixture.ts'))
            .update(readFileSync('tests/helpers/browserTest.ts'))
            .digest('hex'),
          date: new Date().toISOString(),
          browser: browser.version(),
          system: { platform: platform(), release: release(), cpu: cpus()[0]?.model },
          environment,
          stubVersion: 1,
          production: process.env.NAV_TEST_DIST === 'true',
          input:
            '330 RAF per round: 30 warmup + 300 measured; alternating 60 frames ±18px horizontal/±9px vertical pan; mixed jumps +3600px and +1500px vertically at frames 130/230; each round returns to default then settles 1700ms; no frame exclusions',
          requests,
          rounds,
        },
        null,
        2,
      ),
    )
  })
