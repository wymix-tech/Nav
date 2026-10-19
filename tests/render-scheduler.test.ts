import test from 'node:test'
import assert from 'node:assert/strict'
import { createRenderScheduler } from '../packages/frontend/src/canvas/renderScheduler'
test('obsolete mount plans are replaced, heavy views run alone, disposal cancels queued work', () => {
  let id = 0
  const frames = new Map<number, FrameRequestCallback>(),
    mounted: string[] = []
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (fn: FrameRequestCallback) => {
      frames.set(++id, fn)
      return id
    },
  })
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    value: (id: number) => frames.delete(id),
  })
  const scheduler = createRenderScheduler()
  const task = (id: string, heavy = false) => ({ id, heavy, run: () => mounted.push(id) })
  const frame = () => {
    const next = frames.entries().next().value!
    frames.delete(next[0])
    next[1](performance.now())
  }
  scheduler.replace([task('obsolete')])
  scheduler.replace([task('chat', true), task('next'), task('last')])
  frame()
  assert.deepEqual(mounted, ['chat'])
  assert.equal(scheduler.diagnostics().queued, 2)
  frame()
  assert.deepEqual(mounted, ['chat', 'next', 'last'])
  scheduler.replace([task('cancelled')])
  scheduler.dispose()
  assert.equal(frames.size, 0)
  assert.equal(mounted.includes('obsolete'), false)
})
