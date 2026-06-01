import { Hono } from 'hono'
import * as os from 'node:os'
import { execSync } from 'node:child_process'
import { statfsSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const system = new Hono()

// 从项目根目录 __APP_VERSION__ 文件读取本地版本号
function readVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url))
    // 开发环境: dist/routes/system.js → ../../ = packages/server → ../ = 项目根目录
    // Docker 环境: dist/routes/system.js → ../../ = /app（Dockerfile COPY 到 /app）
    const devPath = resolve(__dirname, '../../../__APP_VERSION__')
    const dockerPath = resolve(__dirname, '../../__APP_VERSION__')
    const versionPath = existsSync(dockerPath) ? dockerPath : devPath
    if (existsSync(versionPath)) {
      return readFileSync(versionPath, 'utf-8').trim()
    }
  } catch {
    // ignore
  }
  return 'v0.1.0'
}

// CPU 使用率（采样 100ms）
function getCpuUsage(): number {
  const cpus = os.cpus()
  let totalIdle = 0, totalTick = 0
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times]
    }
    totalIdle += cpu.times.idle
  }
  return Math.round((1 - totalIdle / totalTick) * 100)
}

// CPU 温度（仅 Linux）
function getCpuTemp(): number | null {
  try {
    const raw = execSync('cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null || echo ""', { encoding: 'utf-8', timeout: 1000 }).trim()
    if (!raw) return null
    const temps = raw.split('\n').map(Number).filter((n) => !isNaN(n))
    if (temps.length === 0) return null
    return Math.round(temps.reduce((a, b) => a + b, 0) / temps.length / 1000)
  } catch {
    return null
  }
}

// 内存信息
function getMemory() {
  const total = os.totalmem()
  const free = os.freemem()
  const used = total - free
  return {
    total: Math.round(total / 1024 / 1024 / 1024 * 10) / 10,
    used: Math.round(used / 1024 / 1024 / 1024 * 10) / 10,
    percent: Math.round(used / total * 100),
  }
}

// GPU 信息（nvidia-smi）
function getGpu(): { name: string; usage: number; temp: number | null; memUsed: number; memTotal: number } | null {
  try {
    const raw = execSync(
      'nvidia-smi --query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null',
      { encoding: 'utf-8', timeout: 2000 }
    ).trim()
    if (!raw) return null
    const parts = raw.split(',').map((s) => s.trim())
    return {
      name: parts[0] ?? 'GPU',
      usage: parseInt(parts[1]) || 0,
      temp: parts[2] ? parseInt(parts[2]) : null,
      memUsed: parseInt(parts[3]) || 0,
      memTotal: parseInt(parts[4]) || 0,
    }
  } catch {
    return null
  }
}

// 磁盘信息
function getDisks(paths: string[]): { path: string; total: number; used: number; percent: number }[] {
  return paths.map((p) => {
    try {
      const stats = statfsSync(p)
      const total = stats.blocks * stats.bsize
      const free = stats.bavail * stats.bsize
      const used = total - free
      return {
        path: p,
        total: Math.round(total / 1024 / 1024 / 1024 * 10) / 10,
        used: Math.round(used / 1024 / 1024 / 1024 * 10) / 10,
        percent: Math.round(used / total * 100),
      }
    } catch {
      return { path: p, total: 0, used: 0, percent: 0 }
    }
  })
}

// 系统运行时间
function getUptime(): string {
  const s = os.uptime()
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}天 ${h}时 ${m}分` : `${h}时 ${m}分`
}

// 当前版本信息（从 version.txt 文件读取，构建时写入）
system.get('/version', (c) => {

  const version = readVersion()
  return c.json({
    version,
    repo: 'https://cnb.cool/wymix.top/nav',
  })
})

// 代理 CNB API 获取最新 release，解决浏览器跨域 OPTIONS 预检问题
system.get('/latest-release', async (c) => {
  try {
    // Token 掩码，运行时解码
    const TOKEN_MASK = 'ZEpkQTFlZURBUGZNdnQxMDU0U3BVR21scjRi'
    const token = Buffer.from(TOKEN_MASK, 'base64').toString('utf-8')
    const res = await fetch('https://api.cnb.cool/wymix.top/nav/-/releases/latest', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.cnb.api+json',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      return c.json({ error: '无法获取最新版本信息' }, 502)
    }
    const data = await res.json()
    return c.json(data)
  } catch {
    return c.json({ error: '请求 CNB API 超时或失败' }, 504)
  }
})

system.get('/stats', (c) => {
  const diskPaths = c.req.query('disks')
    ? c.req.query('disks')!.split(',').map((s) => s.trim())
    : ['/']

  const gpu = getGpu()

  return c.json({
    cpu: {
      usage: getCpuUsage(),
      cores: os.cpus().length,
      model: os.cpus()[0]?.model ?? 'Unknown',
      temp: getCpuTemp(),
    },
    memory: getMemory(),
    gpu,
    disks: getDisks(diskPaths),
    uptime: getUptime(),
    hostname: os.hostname(),
    platform: os.platform(),
    loadavg: os.loadavg().map((n) => Math.round(n * 100) / 100),
  })
})

export default system
