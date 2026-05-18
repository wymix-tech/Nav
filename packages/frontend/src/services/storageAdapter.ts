import type { StorageAdapter } from '@nav/shared'
import { LocalAdapter } from './localAdapter'

let adapter: StorageAdapter | null = null
let backendDetected: boolean | null = null

export async function getStorageAdapter(): Promise<StorageAdapter> {
  if (adapter) return adapter

  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(2000) })
    if (res.ok) {
      backendDetected = true
      const { SyncAdapter } = await import('./syncAdapter')
      adapter = new SyncAdapter()
      return adapter
    }
  } catch {
    // 后端不可用
  }

  backendDetected = false
  adapter = new LocalAdapter()
  return adapter
}

export function isBackendAvailable(): boolean {
  return backendDetected === true
}

export function resetAdapter(): void {
  adapter = null
  backendDetected = null
}
