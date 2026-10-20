import { ref } from 'vue'
/** One request per data key, one scheduler per service; late auth results are discarded. */
export function createSharedPoller<T>(load: (key: string, signal: AbortSignal) => Promise<T>) {
  type Listener = {
    fn: (data: T | null, error: string, sampledAt: number, fresh: boolean) => void
    interval: number
    notified: number
  }
  const version = ref(0)
  const consumers = new Map<string, Set<Listener>>(),
    cache = new Map<string, { data: T; time: number }>(),
    pending = new Map<string, AbortController>()
  let timer: ReturnType<typeof setInterval> | undefined,
    epoch = 0,
    lastKey: string | undefined
  async function poll(force = false) {
    if (document.hidden) return
    const ticket = epoch,
      entries = [...consumers]
    const start = lastKey === undefined ? 0 : entries.findIndex(([key]) => key === lastKey) + 1
    const ordered = [...entries.slice(start), ...entries.slice(0, start)]
    await Promise.all(
      ordered.map(async ([key, listeners]) => {
        if (pending.has(key) || pending.size >= 4) return
        const old = cache.get(key),
          interval = Math.min(...[...listeners].map((l) => l.interval))
        if (!force && old && performance.now() - old.time < interval) return
        const controller = new AbortController()
        pending.set(key, controller)
        lastKey = key
        try {
          const data = await load(key, controller.signal)
          if (ticket !== epoch) return
          const time = performance.now()
          version.value++
          cache.delete(key)
          cache.set(key, { data, time })
          if (cache.size > 100)
            for (const cached of cache.keys()) {
              if (!consumers.has(cached)) {
                cache.delete(cached)
                if (cache.size <= 100) break
              }
            }
          for (const l of consumers.get(key) ?? [])
            if (force || time - l.notified >= l.interval) {
              l.notified = time
              l.fn(data, '', time, true)
            }
        } catch (e) {
          if (ticket === epoch && !controller.signal.aborted)
            for (const l of consumers.get(key) ?? [])
              l.fn(old?.data ?? null, (e as Error).message, old?.time ?? 0, false)
        } finally {
          if (pending.get(key) === controller) pending.delete(key)
        }
      }),
    )
  }
  function visibility() {
    if (document.hidden) {
      if (timer) clearInterval(timer)
      timer = undefined
    } else {
      listen()
      void poll()
    }
  }
  function listen() {
    document.addEventListener('visibilitychange', visibility)
    if (!timer && !document.hidden)
      timer = setInterval(() => {
        void poll()
      }, 1000)
  }
  return {
    subscribe(key: string, interval: number, fn: Listener['fn']) {
      const l: Listener = { fn, interval, notified: -Infinity },
        list = consumers.get(key) ?? new Set<Listener>()
      consumers.set(key, list)
      list.add(l)
      const old = cache.get(key)
      if (old) {
        l.notified = old.time
        fn(old.data, '', old.time, false)
      }
      listen()
      void poll()
      let released = false
      return () => {
        if (released) return
        released = true
        list.delete(l)
        if (!list.size) consumers.delete(key)
        if (!consumers.size) {
          if (timer) clearInterval(timer)
          timer = undefined
          document.removeEventListener('visibilitychange', visibility)
        }
      }
    },
    peek(key: string) {
      void version.value
      return cache.get(key)
    },
    reset() {
      version.value++
      epoch++
      for (const p of pending.values()) p.abort()
      pending.clear()
      cache.clear()
      for (const list of consumers.values())
        for (const l of list) l.fn(null, '登录状态已改变', 0, false)
    },
    refresh() {
      return poll(true)
    },
    diagnostics() {
      return {
        keys: consumers.size,
        subscribers: [...consumers.values()].reduce((n, l) => n + l.size, 0),
        pending: pending.size,
        cache: cache.size,
        timers: Number(!!timer),
      }
    },
  }
}
