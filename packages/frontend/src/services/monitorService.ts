import { apiJson } from './apiClient'
const subscribers = new Map<string, Set<(data: any, error: string) => void>>()
const cache = new Map<string, any>()
let timer: ReturnType<typeof setInterval> | null = null,
  running = false
async function poll() {
  if (document.hidden || running) return
  running = true
  try {
    for (const [key, list] of subscribers) {
      try {
        const data = await apiJson(`/system/stats${key ? '?disks=' + encodeURIComponent(key) : ''}`)
        cache.set(key, data)
        for (const fn of list) fn(data, '')
      } catch (e) {
        for (const fn of list) fn(cache.get(key) ?? null, (e as Error).message)
      }
    }
  } finally {
    running = false
  }
}
export function subscribeMonitor(paths: string[], callback: (data: any, error: string) => void) {
  const key = [...paths].sort().join(',')
  let list = subscribers.get(key)
  if (!list) {
    list = new Set()
    subscribers.set(key, list)
  }
  list.add(callback)
  if (cache.has(key)) callback(cache.get(key), '')
  if (!timer) {
    timer = setInterval(() => {
      void poll()
    }, 5000)
    document.addEventListener('visibilitychange', visible)
  }
  void poll()
  return () => {
    const list = subscribers.get(key)
    list?.delete(callback)
    if (!list?.size) subscribers.delete(key)
    if (!subscribers.size && timer) {
      clearInterval(timer)
      timer = null
      document.removeEventListener('visibilitychange', visible)
    }
  }
}
function visible() {
  if (!document.hidden) void poll()
}
