import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 30000,
  use: {
    baseURL:
      process.env.NAV_TEST_URL ??
      (process.env.NAV_TEST_DIST === 'true' ? 'http://127.0.0.1:4000' : 'http://127.0.0.1:3000'),
    headless: true,
    launchOptions: process.env.NAV_CHROMIUM_PATH
      ? {
          executablePath: process.env.NAV_CHROMIUM_PATH,
          args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--no-zygote',
          ],
        }
      : {},
  },
  projects: (process.env.NAV_TEST_BROWSERS ?? 'chromium')
    .split(',')
    .map((name) => ({ name, use: { browserName: name as 'chromium' | 'firefox' | 'webkit' } })),
  reporter: 'list',
  webServer:
    process.env.NAV_TEST_EXTERNAL === 'true'
      ? undefined
      : [
          {
            command: 'node --import tsx packages/server/src/index.ts',
            url: 'http://127.0.0.1:4000/api/health',
            env: {
              NAV_JWT_SECRET: 'browser-test-secret',
              NAV_PASSWORD: 'browser-test-password',
              NAV_DB_PATH: `/tmp/nav-e2e-${process.pid}.db`,
              NAV_UPLOAD_DIR: `/tmp/nav-e2e-uploads-${process.pid}`,
              PORT: '4000',
              NAV_PUBLIC_DIR:
                process.env.NAV_TEST_DIST === 'true'
                  ? resolve('packages/frontend/dist')
                  : '/tmp/nav-no-public-dir',
            },
            reuseExistingServer: false,
          },
          ...(process.env.NAV_TEST_DIST === 'true'
            ? []
            : [
                {
                  command:
                    'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3000 --strictPort',
                  cwd: 'packages/frontend',
                  url: 'http://127.0.0.1:3000',
                  reuseExistingServer: false,
                },
              ]),
        ],
})
