import test from 'node:test'
import assert from 'node:assert/strict'
import { validateInstalled } from '../packages/shared/src/index.ts'
test('plugin validation rejects mutable, malformed and mismatched entry points', () => {
  const commit = 'a'.repeat(40),
    widget = {
      widgetId: 'test',
      commit,
      cdnUrl: `https://cdn.jsdelivr.net/gh/a/b@${commit}/index.js`,
      installedAt: 'now',
      manifest: {
        manifestVersion: 2,
        name: 'test',
        displayName: 'Test',
        entry: 'index.js',
        schema: {},
        size: { w: 4, h: 3 },
        minSize: { w: 2, h: 2 },
        networkOrigins: [],
      },
    }
  validateInstalled(widget)
  assert.throws(() => validateInstalled({ ...widget, cdnUrl: 'broken' }))
  assert.throws(() =>
    validateInstalled({ ...widget, cdnUrl: widget.cdnUrl.replace(commit, 'main') }),
  )
  assert.throws(() =>
    validateInstalled({ ...widget, manifest: { ...widget.manifest, entry: 'other.js' } }),
  )
  assert.throws(() =>
    validateInstalled({ ...widget, manifest: { ...widget.manifest, minSize: { w: -1, h: 2 } } }),
  )
})
