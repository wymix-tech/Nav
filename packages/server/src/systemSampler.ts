import * as os from 'node:os'
import { statfs, readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run = promisify(execFile)
export const allowedDisks = (process.env.NAV_MONITOR_DISKS ?? '/')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .slice(0, 8)
let cached: Record<string, any> | null = null,
  running = false
let previous: { idle: number; total: number } | null = null
export function cpuUsage(cpus: ReturnType<typeof os.cpus>): number {
  const now = cpus.reduce(
    (sum, cpu) => ({
      idle: sum.idle + cpu.times.idle,
      total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0),
    }),
    { idle: 0, total: 0 },
  )
  const delta = previous
    ? { idle: now.idle - previous.idle, total: now.total - previous.total }
    : null
  previous = now
  return delta && delta.total > 0
    ? Math.max(0, Math.min(100, Math.round((1 - delta.idle / delta.total) * 100)))
    : 0
}
export async function sampleSystem(): Promise<void> {
  if (running) return
  running = true
  try {
    const cpus = os.cpus(),
      total = os.totalmem(),
      used = total - os.freemem()
    const [temp, gpu, disks] = await Promise.all([
      readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8')
        .then((s) => Math.round(Number(s) / 1000))
        .catch(() => null),
      run(
        'nvidia-smi',
        [
          '--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total',
          '--format=csv,noheader,nounits',
        ],
        { timeout: 1500, maxBuffer: 4096 },
      )
        .then(({ stdout }) => {
          const [name, usage, temp, memUsed, memTotal] = stdout
            .trim()
            .split('\n')[0]
            .split(',')
            .map((s) => s.trim())
          return {
            name,
            usage: Number(usage) || 0,
            temp: Number(temp) || null,
            memUsed: Number(memUsed) || 0,
            memTotal: Number(memTotal) || 0,
          }
        })
        .catch(() => null),
      Promise.all(
        allowedDisks.map(async (path) => {
          try {
            const s = await statfs(path),
              total = s.blocks * s.bsize,
              used = total - s.bavail * s.bsize
            return {
              path,
              total: Math.round((total / 2 ** 30) * 10) / 10,
              used: Math.round((used / 2 ** 30) * 10) / 10,
              percent: total ? Math.round((used / total) * 100) : 0,
            }
          } catch {
            return { path, total: 0, used: 0, percent: 0 }
          }
        }),
      ),
    ])
    cached = {
      cpu: { usage: cpuUsage(cpus), cores: cpus.length, model: cpus[0]?.model ?? 'Unknown', temp },
      memory: {
        total: Math.round((total / 2 ** 30) * 10) / 10,
        used: Math.round((used / 2 ** 30) * 10) / 10,
        percent: Math.round((used / total) * 100),
      },
      gpu,
      disks,
      uptime: `${Math.floor(os.uptime() / 3600)}时 ${Math.floor((os.uptime() % 3600) / 60)}分`,
      hostname: os.hostname(),
      platform: os.platform(),
      loadavg: os.loadavg(),
      sampledAt: new Date().toISOString(),
      scope: 'operating-system',
    }
  } finally {
    running = false
  }
}
export function systemSnapshot() {
  return cached
}
void sampleSystem()
setInterval(() => {
  void sampleSystem().catch(() => {})
}, 5000).unref()
