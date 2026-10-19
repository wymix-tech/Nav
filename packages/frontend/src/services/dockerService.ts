import { apiJson } from './apiClient'
import { createSharedPoller } from './sharedPoller'
export interface DockerContainer {
  id: string
  name: string
  image: string
  state: string
  status: string
  cpuPercent: number
  memUsage: string
  memPercent: number
  netIO: string
  blockIO: string
  pids: number
}
export interface DockerData {
  available: boolean
  containers: DockerContainer[]
  message?: string
}
const service = createSharedPoller<DockerData>((_, signal) =>
  apiJson('/system/docker', {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  }),
)
export function subscribeDocker(
  seconds: number,
  callback: (data: DockerData | null, error: string, time: number, fresh: boolean) => void,
) {
  return service.subscribe('server', Math.max(5, Math.min(60, seconds)) * 1000, callback)
}
export const resetDocker = service.reset
export const refreshDocker = service.refresh
export const dockerDiagnostics = service.diagnostics
export function createNetworkRate() {
  let previous: { id: string; rx: number; tx: number; time: number } | undefined
  return {
    reset() {
      previous = undefined
    },
    sample(id: string, rx: number, tx: number, time: number) {
      if (previous?.time === time) return null
      const old = previous
      previous = { id, rx, tx, time }
      if (
        !old ||
        old.id !== id ||
        time <= old.time ||
        rx < old.rx ||
        tx < old.tx ||
        time - old.time > 65000
      )
        return null
      const seconds = (time - old.time) / 1000
      return { rx: (rx - old.rx) / seconds, tx: (tx - old.tx) / seconds }
    },
  }
}

export function getDockerSummary(name: string) {
  const data = service.peek('server')?.data
  const container = data?.containers.find((c) => c.name === name)
  return container ? { state: container.state, cpu: container.cpuPercent } : undefined
}
