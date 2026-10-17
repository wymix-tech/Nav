import type { Context } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'
export class RateLimiter {
  private entries = new Map<string, { count: number; until: number }>()
  constructor(
    private max = 5,
    private window = 900000,
    private capacity = 10000,
  ) {}
  allow(key: string, now = Date.now()): boolean {
    for (const [k, value] of this.entries) if (value.until <= now) this.entries.delete(k)
    const old = this.entries.get(key)
    if (old) {
      if (old.count >= this.max) return false
      old.count++
      return true
    }
    if (this.entries.size >= this.capacity) return false
    this.entries.set(key, { count: 1, until: now + this.window })
    return true
  }
  clear(key: string) {
    this.entries.delete(key)
  }
}
export function clientAddress(c: Context): string {
  let peer = 'unknown'
  try {
    peer = getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    /* request tests have no socket */
  }
  const trusted = new Set(
    (process.env.NAV_TRUSTED_PROXIES ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  )
  if (!trusted.has(peer)) return peer
  const chain = (c.req.header('x-forwarded-for') ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  while (chain.length && trusted.has(peer)) peer = chain.pop()!
  return peer
}
