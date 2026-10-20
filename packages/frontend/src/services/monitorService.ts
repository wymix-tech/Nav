import { apiJson } from './apiClient'
import { createSharedPoller } from './sharedPoller'
const service = createSharedPoller<unknown>((key, signal) =>
  apiJson(`/system/stats${key ? '?disks=' + encodeURIComponent(key) : ''}`, { signal }),
)
export function subscribeMonitor(paths: string[], callback: (data: any, error: string) => void) {
  return service.subscribe([...new Set(paths)].sort().join(','), 5000, callback)
}
export const resetMonitor = service.reset
export const monitorDiagnostics = service.diagnostics

export function getMonitorSummary(paths: string[]) {
  const cached = service.peek([...new Set(paths)].sort().join(','))
  const data = cached?.data as { cpu?: { usage?: number }; hostname?: string } | undefined
  return typeof data?.cpu?.usage === 'number' && typeof data.hostname === 'string'
    ? { cpu: data.cpu.usage, hostname: data.hostname.slice(0, 100) }
    : undefined
}
