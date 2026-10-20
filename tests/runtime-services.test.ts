import test from 'node:test'
import assert from 'node:assert/strict'
import { createSharedPoller } from '../packages/frontend/src/services/sharedPoller'
import { getWeather } from '../packages/frontend/src/services/weatherService'
import { subscribeClock, clockDiagnostics } from '../packages/frontend/src/services/clockService'
class FakeDocument extends EventTarget {
  hidden = false
}
const document = new FakeDocument()
Object.defineProperty(globalThis, 'document', { value: document, configurable: true })
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))
test('same source subscriptions share a request; releasing one consumer does not cancel others; auth epoch rejects late data', async () => {
  let resolve!: (data: { value: string }) => void,
    calls = 0,
    signal: AbortSignal | undefined
  const service = createSharedPoller((_, s) => {
    calls++
    signal = s
    return new Promise<{ value: string }>((r) => {
      resolve = r
    })
  })
  const a: unknown[] = [],
    b: unknown[] = []
  const releaseA = service.subscribe('same', 5000, (data) => a.push(data))
  const releaseB = service.subscribe('same', 10000, (data) => b.push(data))
  assert.equal(calls, 1)
  releaseA()
  releaseA()
  assert.equal(signal!.aborted, false)
  resolve({ value: 'shared' })
  await tick()
  assert.deepEqual(a, [])
  assert.deepEqual(b, [{ value: 'shared' }])
  const refreshing = service.refresh()
  assert.equal(calls, 2)
  service.reset()
  assert.equal(signal!.aborted, true)
  resolve({ value: 'PRIVATE_LATE' })
  await refreshing
  assert.deepEqual(b, [{ value: 'shared' }, null])
  assert.equal(service.diagnostics().cache, 0)
  releaseB()
  assert.equal(service.diagnostics().timers, 0)
  assert.equal(service.diagnostics().subscribers, 0)
})
test('different keys remain independent and hidden tabs do not start polling', async () => {
  const calls: string[] = [],
    service = createSharedPoller(async (key) => {
      calls.push(key)
      return key
    })
  document.hidden = true
  const a = service.subscribe('disk-a', 5000, () => {}),
    b = service.subscribe('disk-b', 5000, () => {})
  await tick()
  assert.deepEqual(calls, [])
  document.hidden = false
  document.dispatchEvent(new Event('visibilitychange'))
  await tick()
  assert.deepEqual(calls.sort(), ['disk-a', 'disk-b'])
  a()
  b()
  service.reset()
})
test('same city weather in-flight is deduplicated; aborted consumer cannot cancel the shared result or corrupt another city', async (t) => {
  const responses = new Map<string, (response: Response) => void>(),
    requests: string[] = []
  t.mock.method(globalThis, 'fetch', (url: string) => {
    requests.push(url)
    return new Promise<Response>((resolve) => {
      responses.set(url, resolve)
    })
  })
  const a = new AbortController(),
    b = new AbortController()
  const one = getWeather('test-city-a', a.signal),
    two = getWeather('test-city-a', b.signal),
    three = getWeather('test-city-b', b.signal)
  const rejected = assert.rejects(one, { name: 'AbortError' })
  a.abort()
  assert.equal(requests.length, 2)
  for (const [url, resolve] of responses)
    resolve(Response.json({ current_condition: [{ city: url.includes('city-a') ? 'a' : 'b' }] }))
  await rejected
  assert.equal((await two).data.current_condition[0].city, 'a')
  assert.equal((await three).data.current_condition[0].city, 'b')
  await getWeather('test-city-a', b.signal)
  assert.equal(requests.length, 2)
})
test('100 clocks share one scheduler; summary updates at minute demand; hidden and final release stop timers', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 60000 })
  let full = 0,
    summary = 0
  const subscriptions = Array.from({ length: 100 }, () => subscribeClock('second', () => full++))
  const minute = subscribeClock('minute', () => summary++)
  assert.equal(clockDiagnostics().timers, 1)
  const before = full,
    summaryBefore = summary
  t.mock.timers.tick(1000)
  assert.equal(full - before, 100)
  assert.equal(summary, summaryBefore)
  t.mock.timers.tick(60000)
  assert.ok(summary > summaryBefore)
  document.hidden = true
  document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(clockDiagnostics().timers, 0)
  const hidden = full
  t.mock.timers.tick(5000)
  assert.equal(full, hidden)
  document.hidden = false
  document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(clockDiagnostics().timers, 1)
  for (const subscription of subscriptions) {
    subscription.release()
    subscription.release()
  }
  minute.release()
  assert.deepEqual(clockDiagnostics(), { subscribers: 0, timers: 0 })
})
test('a resumed consumer distinguishes cached display data from a fresh rate baseline', async (t) => {
  const values: unknown[][] = []
  const service = createSharedPoller(async () => ({ value: 'snapshot' }))
  const release = service.subscribe('source', 5000, (...args) => values.push(args))
  let resumed = () => {}
  t.after(() => {
    release()
    resumed?.()
    service.reset()
  })
  await tick()
  assert.equal(values.at(-1)?.[3], true)
  release()
  resumed = service.subscribe('source', 5000, (...args) => values.push(args))
  assert.equal(values.at(-1)?.[3], false)
  await service.refresh()
  assert.equal(values.at(-1)?.[3], true)
  resumed()
  service.reset()
})
test('resuming 100 independent sampler keys bounds concurrency and reaches every key fairly', async (t) => {
  let active = 0,
    peak = 0
  const seen = new Set<string>(),
    waiting: (() => void)[] = [],
    releases: (() => void)[] = []
  const service = createSharedPoller((key) => {
    active++
    peak = Math.max(peak, active)
    seen.add(key)
    return new Promise<string>((resolve) =>
      waiting.push(() => {
        active--
        resolve(key)
      }),
    )
  })
  t.after(() => {
    for (const release of releases) release()
    service.reset()
    for (const resolve of waiting) resolve()
  })
  for (let i = 0; i < 100; i++) releases.push(service.subscribe(`source-${i}`, 5000, () => {}))
  assert.ok(peak <= 4, `peak ${peak} exceeds the sampler concurrency budget`)
  for (let round = 0; round < 25; round++) {
    for (const resolve of waiting.splice(0)) resolve()
    await tick()
    if (seen.size < 100) void service.refresh()
  }
  for (const resolve of waiting.splice(0)) resolve()
  await tick()
  assert.equal(seen.size, 100)
  assert.ok(peak <= 4)
})
