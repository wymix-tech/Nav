import type { StorageAdapter } from '@nav/shared'
import { LocalAdapter } from './localAdapter'
let adapter: Promise<StorageAdapter> | null = null
export const localMode = import.meta.env?.VITE_STORAGE_MODE === 'local'
export function getStorageAdapter(): Promise<StorageAdapter> {
  adapter ??= (
    localMode
      ? Promise.resolve(new LocalAdapter())
      : import('./syncAdapter').then(({ SyncAdapter }) => new SyncAdapter())
  ).catch((error) => {
    adapter = null
    throw error
  })
  return adapter
}
export function isBackendAvailable(): boolean {
  return !localMode
}
export function resetAdapter(): void {
  /* Keep the cache and queue identity across login. */
}
