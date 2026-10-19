import { defineConfig } from '@playwright/test'
import base from './playwright.config'
export default defineConfig({
  ...base,
  testDir: './tests',
  testMatch: 'performance.spec.ts',
  timeout: 180000,
  outputDir: 'performance-results',
})
