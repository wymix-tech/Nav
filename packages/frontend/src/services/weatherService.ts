const cache = new Map<string, { data: any; time: number }>()
export async function getWeather(
  city: string,
  signal: AbortSignal,
): Promise<{ data: any; time: number }> {
  const old = cache.get(city)
  if (old && Date.now() - old.time < 600000) return old
  const controller = new AbortController(),
    abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) controller.abort()
  const timeout = setTimeout(abort, 10000)
  try {
    const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=zh`, {
      signal: controller.signal,
    })
    if (!response.ok) throw new Error('天气服务暂不可用')
    const data = await response.json()
    if (!data?.current_condition?.[0]) throw new Error('天气数据格式无效')
    const result = { data, time: Date.now() }
    cache.set(city, result)
    return result
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', abort)
  }
}
