import { shallowRef } from 'vue'
export interface ClockSnapshot {
  time: string
  seconds: string
  date: string
}
const demands = new Map<
  symbol,
  { demand: 'second' | 'minute'; update: (value: ClockSnapshot) => void }
>()
let timer: ReturnType<typeof setInterval> | undefined,
  lastMinute = -1,
  dateKey = '',
  dateText = ''
export function currentClock(): ClockSnapshot {
  const now = new Date(),
    key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
  if (key !== dateKey) {
    dateKey = key
    dateText = now.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long',
    })
  }
  return {
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    seconds: String(now.getSeconds()).padStart(2, '0'),
    date: dateText,
  }
}
function tick() {
  if (document.hidden) return
  const value = currentClock(),
    minute = Math.floor(Date.now() / 60000)
  for (const { demand, update } of demands.values())
    if (demand === 'second' || minute !== lastMinute) update(value)
  lastMinute = minute
}
function visibility() {
  if (timer) clearInterval(timer)
  timer = undefined
  if (!document.hidden && demands.size) {
    lastMinute = -1
    tick()
    timer = setInterval(tick, 1000)
  }
}
export function subscribeClock(
  demand: 'second' | 'minute' = 'second',
  callback?: (value: ClockSnapshot) => void,
) {
  const token = Symbol(),
    snapshot = shallowRef(currentClock())
  demands.set(token, {
    demand,
    update(value) {
      snapshot.value = value
      callback?.(value)
    },
  })
  callback?.(snapshot.value)
  if (demands.size === 1) {
    document.addEventListener('visibilitychange', visibility)
    visibility()
  }
  let released = false
  return {
    snapshot,
    release() {
      if (released) return
      released = true
      demands.delete(token)
      if (!demands.size) {
        if (timer) clearInterval(timer)
        timer = undefined
        document.removeEventListener('visibilitychange', visibility)
      }
    },
  }
}
export function clockDiagnostics() {
  return { subscribers: demands.size, timers: Number(!!timer) }
}
