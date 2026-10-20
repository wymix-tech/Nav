import { ref } from 'vue'
interface WeatherResult {
  data: any
  time: number
}
const version = ref(0)
const cache = new Map<string, WeatherResult>()
const pending = new Map<string, Promise<WeatherResult>>()
/** A consumer cancellation does not abort another consumer's shared request. */
export async function getWeather(city: string, signal: AbortSignal): Promise<WeatherResult> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const old = cache.get(city)
  if (old && Date.now() - old.time < 600000) return old
  let request = pending.get(city)
  if (!request) {
    request = (async () => {
      const response = await fetch(
        `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=zh`,
        { signal: AbortSignal.timeout(10000) },
      )
      if (!response.ok) throw new Error('天气服务暂不可用')
      const data = await response.json()
      if (!data?.current_condition?.[0]) throw new Error('天气数据格式无效')
      const result = { data, time: Date.now() }
      cache.set(city, result)
      version.value++
      if (cache.size > 100) cache.delete(cache.keys().next().value!)
      return result
    })()
    pending.set(city, request)
    void request
      .finally(() => {
        if (pending.get(city) === request) pending.delete(city)
      })
      .catch(() => {})
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    request!
      .then((value) => {
        if (!signal.aborted) resolve(value)
      }, reject)
      .finally(() => signal.removeEventListener('abort', abort))
      .catch(() => {})
  })
}
export function weatherDiagnostics() {
  return {
    cache: cache.size,
    pending: pending.size,
    subscribers: consumers.size,
    timers: Number(!!timer),
  }
}

const consumers = new Map<symbol, () => void>()
let timer: ReturnType<typeof setInterval> | undefined
function refreshWeatherConsumers() {
  if (!document.hidden) for (const refresh of consumers.values()) refresh()
}
export function subscribeWeatherRefresh(refresh: () => void) {
  const token = Symbol()
  consumers.set(token, refresh)
  if (!timer) {
    timer = setInterval(refreshWeatherConsumers, 60000)
    document.addEventListener('visibilitychange', refreshWeatherConsumers)
  }
  return () => {
    consumers.delete(token)
    if (!consumers.size && timer) {
      clearInterval(timer)
      timer = undefined
      document.removeEventListener('visibilitychange', refreshWeatherConsumers)
    }
  }
}

export function getWeatherSummary(city: string, unit: string) {
  void version.value
  const cached = cache.get(city),
    current = cached?.data?.current_condition?.[0]
  const value = Number(current?.[unit === 'imperial' ? 'temp_F' : 'temp_C'])
  return cached && Number.isFinite(value)
    ? { temp: Math.round(value), time: cached.time }
    : undefined
}
