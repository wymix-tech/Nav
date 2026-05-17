import type { StorageAdapter } from '@nav/shared'
import { LocalAdapter } from './localAdapter'

let adapter: StorageAdapter | null = null

export async function getStorageAdapter(): Promise<StorageAdapter> {
  if (adapter) return adapter

  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(2000) })
    if (res.ok) {
      const { SyncAdapter } = await import('./syncAdapter')
      adapter = new SyncAdapter()
      return adapter
    }
  } catch {
    // 后端不可用
  }

  adapter = new LocalAdapter()
  return adapter
}
