import type { StorageAdapter } from '@nav/shared'
import { LocalAdapter } from './localAdapter'
let adapter: StorageAdapter | null = null
export const localMode = import.meta.env?.VITE_STORAGE_MODE === 'local'
export async function getStorageAdapter(): Promise<StorageAdapter> {
  if (!adapter)
    adapter = localMode ? new LocalAdapter() : new (await import('./syncAdapter')).SyncAdapter()
  return adapter
}
export function isBackendAvailable(): boolean {
  return !localMode
}
export function resetAdapter(): void {
  /* Keep the cache and queue identity across login. */
}
