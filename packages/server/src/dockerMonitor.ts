import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const execute = promisify(execFile)
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
type Runner = (args: string[]) => Promise<string>
const run: Runner = async (args) =>
  (await execute('docker', args, { timeout: 6000, maxBuffer: 1024 * 1024 })).stdout
export function createDockerMonitor(runner: Runner = run) {
  let cached:
    | { available: boolean; containers: DockerContainer[]; sampledAt: string; message?: string }
    | undefined
  let until = 0,
    pending: Promise<NonNullable<typeof cached>> | undefined
  return async function sample() {
    if (cached && Date.now() < until) return cached
    pending ??= (async () => {
      try {
        const lines = (await runner(['ps', '-a', '--format', '{{json .}}']))
          .trim()
          .split('\n')
          .filter(Boolean)
        if (lines.length > 500) throw new Error('Too many containers')
        const containers: DockerContainer[] = lines.map((line) => {
          const c = JSON.parse(line)
          return {
            id: String(c.ID),
            name: String(c.Names),
            image: String(c.Image),
            state: String(c.State),
            status: String(c.Status),
            cpuPercent: 0,
            memUsage: '-',
            memPercent: 0,
            netIO: '0B / 0B',
            blockIO: '-',
            pids: 0,
          }
        })
        const ids = containers
          .filter((c) => c.state === 'running' && /^[a-f0-9]{12,64}$/i.test(c.id))
          .map((c) => c.id)
        if (ids.length) {
          const stats = (await runner(['stats', '--no-stream', '--format', '{{json .}}', ...ids]))
            .trim()
            .split('\n')
            .filter(Boolean)
          for (const line of stats) {
            const s = JSON.parse(line),
              container = containers.find((c) => c.name === s.Name || c.id === s.ID)
            if (container)
              Object.assign(container, {
                cpuPercent: parseFloat(s.CPUPerc) || 0,
                memUsage: String(s.MemUsage),
                memPercent: parseFloat(s.MemPerc) || 0,
                netIO: String(s.NetIO),
                blockIO: String(s.BlockIO),
                pids: parseInt(s.PIDs) || 0,
              })
          }
        }
        cached = { available: true, containers, sampledAt: new Date().toISOString() }
      } catch {
        cached = {
          available: false,
          containers: [],
          sampledAt: new Date().toISOString(),
          message: 'Docker 未可用，请检查 Docker CLI 和 Socket 访问权限',
        }
      }
      until = Date.now() + 5000
      return cached
    })().finally(() => {
      pending = undefined
    })
    return pending
  }
}
export const dockerSnapshot = createDockerMonitor()
