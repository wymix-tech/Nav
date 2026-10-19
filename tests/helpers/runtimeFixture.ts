import { expect, type APIRequestContext, type Page } from '@playwright/test'
import {
  createDashboard,
  initialScene,
  type Dashboard,
  type WidgetInstance,
} from '../../packages/shared/src/index'
export const backend = process.env.NAV_TEST_API ?? 'http://127.0.0.1:4000'
export async function login(request: APIRequestContext) {
  const response = await request.post(backend + '/api/auth/login', {
    data: { password: process.env.NAV_TEST_PASSWORD ?? 'browser-test-password' },
  })
  expect(response.ok()).toBeTruthy()
  return (await response.json()).token as string
}
export async function saveFixture(request: APIRequestContext, token: string, d: Dashboard) {
  const old = await (await request.get(backend + '/api/dashboards')).json()
  const response = await request.put(backend + '/api/dashboards/default/state', {
    headers: { Authorization: `Bearer ${token}`, 'If-Match': String(old.revision) },
    data: {
      schemaVersion: 3,
      operationId: crypto.randomUUID(),
      snapshot: { ...d, instanceId: old.instanceId },
    },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  return response.json()
}
export function canvasFixture(count = 25, mixed = false, dense = false): Dashboard {
  const d = createDashboard(),
    l = { x: 0, y: 0, w: 3, h: 3 }
  d.layoutMode = 'canvas'
  d.canvasSettings = {
    version: 1,
    defaultCamera: { centerX: dense ? 800 : 400, centerY: dense ? 400 : 180, zoom: 1 },
  }
  const types = [
    ...Array(30).fill('clock'),
    ...Array(20).fill('bookmark'),
    ...Array(10).fill('search'),
    ...Array(10).fill('weather'),
    ...Array(10).fill('monitor'),
    ...Array(10).fill('docker'),
    ...Array(5).fill('chat'),
    ...Array(5).fill('perf-plugin'),
  ]
  d.widgets = Array.from({ length: count }, (_, i): WidgetInstance => ({
    id: `runtime-${i}`,
    source: mixed && i >= 95 ? 'installed' : 'builtin',
    widgetId: mixed ? types[i] : 'clock',
    config:
      mixed && types[i] === 'docker'
        ? { containerName: 'fixture' }
        : mixed && types[i] === 'bookmark'
          ? {
              groups: [
                { name: 'sample', bookmarks: [{ title: 'sample', url: 'https://example.com' }] },
              ],
            }
          : {},
    layouts: { lg: l, md: l, sm: l, xs: l },
    canvas: dense
      ? { x: (i % 10) * 160, y: Math.floor(i / 10) * 80, w: 160, h: 80 }
      : { x: (i % 10) * 500, y: Math.floor(i / 10) * 600, w: 320, h: 280 },
  }))
  d.canvasScene = initialScene(d.widgets.map((w) => w.id))
  return d
}
export async function isolateServices(page: Page, token: string, mode = 'safe') {
  await page.addInitScript(
    ({ token, mode }) => {
      if (window !== window.top) return
      localStorage.setItem('nav_token', token)
      sessionStorage.setItem('nav_resource_mode', mode)
    },
    { token, mode },
  )
  await page.route('https://wttr.in/**', (r) =>
    r.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      json: {
        current_condition: [
          {
            temp_C: '22',
            temp_F: '72',
            FeelsLikeC: '22',
            FeelsLikeF: '72',
            weatherDesc: [{ value: 'Sunny' }],
            humidity: '50',
            windspeedKmph: '10',
            windspeedMiles: '6',
            winddir16Point: 'N',
            uvIndex: '2',
            pressure: '1012',
            cloudcover: '10',
          },
        ],
      },
    }),
  )
  await page.route('https://www.google.com/s2/**', (r) => r.fulfill({ status: 204 }))
  await page.route('**/api/system/stats*', (r) =>
    r.fulfill({
      json: {
        cpu: { usage: 20, cores: 4, model: 'fixture', temp: 40 },
        memory: { total: 16, used: 4, percent: 25 },
        gpu: null,
        disks: [],
        uptime: '1h',
        hostname: 'fixture',
        platform: 'linux',
        loadavg: [0, 0, 0],
      },
    }),
  )
  await page.route('**/api/system/docker', (r) =>
    r.fulfill({
      json: {
        available: true,
        containers: [
          {
            id: 'fixture',
            name: 'fixture',
            image: 'fixture',
            state: 'running',
            status: 'Up',
            cpuPercent: 1,
            memUsage: '1MB',
            memPercent: 1,
            netIO: '1kB / 2kB',
            blockIO: '0B / 0B',
            pids: 1,
          },
        ],
      },
    }),
  )
  await page.route('**/api/chat/models', (r) => r.fulfill({ json: { models: ['fixture'] } }))
  await page.route('**/api/chat/defaults', (r) => r.fulfill({ json: { systemPrompt: '' } }))
  await page.route('**/api/chat/stream', (r) => r.abort('blockedbyclient'))
  await page.route('https://cdn.jsdelivr.net/gh/test/perf@*/index.js', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: 'export function mount(el) { el.innerHTML = `<input placeholder="plugin draft">`; return () => {} }',
    }),
  )
}
export async function installFixturePlugin(request: APIRequestContext, token: string) {
  const old = await (await request.get(backend + '/api/installed-widgets/revision')).json(),
    commit = 'b'.repeat(40)
  const response = await request.post(backend + '/api/installed-widgets', {
    headers: {
      Authorization: `Bearer ${token}`,
      'If-Match': String(old.revision),
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: {
      widgetId: 'perf-plugin',
      commit,
      cdnUrl: `https://cdn.jsdelivr.net/gh/test/perf@${commit}/index.js`,
      installedAt: new Date().toISOString(),
      manifest: {
        manifestVersion: 2,
        name: 'perf-plugin',
        displayName: 'Fixture Plugin',
        version: '1',
        entry: 'index.js',
        description: 'fixture',
        author: 'fixture',
        icon: '',
        repository: 'https://github.com/test/perf',
        schema: {},
        size: { w: 3, h: 3 },
        minSize: { w: 2, h: 2 },
        networkOrigins: [],
      },
    },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
}
