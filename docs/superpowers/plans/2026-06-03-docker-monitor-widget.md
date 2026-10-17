# Docker 容器监控组件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 Docker 容器监控组件，实时展示容器状态、CPU/内存/网络使用率，通过 Docker Socket 获取数据。

**Architecture:** 后端通过 `docker ps` 和 `docker stats --no-stream` 获取容器信息（需映射 `/var/run/docker.sock`），前端新增 DockerWidget 遵循 MonitorWidget 的设计模式（glass 效果、进度条、颜色编码），注册为内置组件。

**Tech Stack:** Hono（后端路由）、Vue 3 Composition API（前端组件）、Docker CLI（数据采集）、Aura 设计系统

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| Modify | `packages/server/src/routes/system.ts` | 新增 `/docker` 路由，调用 docker CLI 获取容器数据 |
| Modify | `packages/server/src/index.ts` | 无需修改（路由已注册在 `/api/system`） |
| Create | `packages/frontend/src/widgets/DockerWidget.vue` | Docker 容器监控组件 |
| Modify | `packages/frontend/src/components/WidgetRenderer.vue` | 注册 docker 组件 |
| Modify | `packages/frontend/src/components/WidgetLibrary.vue` | 添加 docker 到组件库列表和默认尺寸 |
| Modify | `docker-compose.yml` | 映射 `/var/run/docker.sock` |
| Modify | `Dockerfile` | 无需修改（docker CLI 在 alpine 基础镜像中已可用需确认） |

---

### Task 1: 后端 Docker API 路由

**Files:**
- Modify: `packages/server/src/routes/system.ts`

- [ ] **Step 1: 在 system.ts 中添加 docker 相关函数和路由**

在 `system.ts` 文件末尾（`export default system` 之前）添加：

```typescript
// ===== Docker 容器监控 =====

interface DockerContainer {
  id: string
  name: string
  image: string
  state: string       // running, exited, paused, etc.
  status: string      // "Up 3 days", "Exited (0) 2 hours ago"
  cpuPercent: number
  memUsage: string
  memPercent: number
  netIO: string
  blockIO: string
  pids: number
}

// 检查 docker 命令是否可用
let dockerAvailable: boolean | null = null
function checkDocker(): boolean {
  if (dockerAvailable !== null) return dockerAvailable
  try {
    execSync('docker info --format "{{.ServerVersion}}"', { timeout: 3000, stdio: 'pipe' })
    dockerAvailable = true
  } catch {
    dockerAvailable = false
  }
  return dockerAvailable
}

function getDockerContainers(): DockerContainer[] {
  if (!checkDocker()) return []

  try {
    // 获取容器基本信息
    const psOutput = execSync(
      `docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.State}}|{{.Status}}'`,
      { timeout: 5000, encoding: 'utf-8' }
    ).trim()

    if (!psOutput) return []

    const containers: DockerContainer[] = psOutput.split('\n').filter(Boolean).map((line) => {
      const [id, name, image, state, status] = line.split('|')
      return {
        id: id.slice(0, 12),
        name,
        image,
        state,
        status,
        cpuPercent: 0,
        memUsage: '-',
        memPercent: 0,
        netIO: '-',
        blockIO: '-',
        pids: 0,
      }
    })

    // 获取运行中容器的资源使用率
    const runningIds = containers.filter((c) => c.state === 'running').map((c) => c.id)
    if (runningIds.length > 0) {
      try {
        const statsOutput = execSync(
          `docker stats ${runningIds.join(' ')} --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}'`,
          { timeout: 10000, encoding: 'utf-8' }
        ).trim()

        for (const line of statsOutput.split('\n').filter(Boolean)) {
          const [name, cpu, memUsage, memPerc, netIO, blockIO, pids] = line.split('|')
          const container = containers.find((c) => c.name === name)
          if (container) {
            container.cpuPercent = parseFloat(cpu.replace('%', '')) || 0
            container.memUsage = memUsage
            container.memPercent = parseFloat(memPerc.replace('%', '')) || 0
            container.netIO = netIO
            container.blockIO = blockIO
            container.pids = parseInt(pids) || 0
          }
        }
      } catch {
        // docker stats 可能超时，保留基本信息
      }
    }

    return containers
  } catch {
    return []
  }
}

system.get('/docker', (c) => {
  const available = checkDocker()
  if (!available) {
    return c.json({
      available: false,
      message: 'Docker 未可用，请确保已映射 /var/run/docker.sock',
      containers: [],
    })
  }
  const containers = getDockerContainers()
  return c.json({
    available: true,
    containers,
    total: containers.length,
    running: containers.filter((c) => c.state === 'running').length,
  })
})
```

- [ ] **Step 2: 构建后端验证**

Run: `cd /workspace/packages/server && npx tsc --noEmit 2>&1 | head -20`
Expected: 无新增报错

- [ ] **Step 3: 提交**

```bash
git add packages/server/src/routes/system.ts
git commit -m "feat: 新增 Docker 容器监控 API 路由 /api/system/docker"
```

---

### Task 2: 创建 DockerWidget 前端组件

**Files:**
- Create: `packages/frontend/src/widgets/DockerWidget.vue`

- [ ] **Step 1: 创建 DockerWidget.vue**

完整文件内容：

```vue
<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps<{
  config: Record<string, any>
  editing: boolean
  editable: boolean
}>()

const emit = defineEmits<{
  'update:config': [value: Record<string, any>]
}>()

interface DockerContainer {
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

interface DockerStats {
  available: boolean
  message?: string
  containers: DockerContainer[]
  total: number
  running: number
}

const stats = ref<DockerStats | null>(null)
const error = ref('')
const loading = ref(false)
const showConfig = ref(false)

const refreshInterval = ref(props.config.interval ?? 5)
const showAllContainers = ref(props.config.showAllContainers ?? false)

let timer: ReturnType<typeof setInterval> | null = null

function getStateColor(state: string): string {
  if (state === 'running') return '#22c55e'
  if (state === 'paused') return '#f59e0b'
  return '#ef4444'
}

function getStateLabel(state: string): string {
  if (state === 'running') return '运行中'
  if (state === 'paused') return '已暂停'
  if (state === 'exited') return '已停止'
  return state
}

function getColor(pct: number): string {
  if (pct >= 90) return '#ef4444'
  if (pct >= 70) return '#f59e0b'
  return '#22c55e'
}

function formatImage(image: string): string {
  // 去掉 sha256 digest，缩短显示
  const parts = image.split('@')
  return parts[0]
}

async function fetchStats() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch('/api/system/docker')
    if (!res.ok) throw new Error(`请求失败 (${res.status})`)
    stats.value = await res.json()
  } catch (e: any) {
    error.value = e.message ?? '获取 Docker 信息失败'
    stats.value = null
  } finally {
    loading.value = false
  }
}

function saveConfig() {
  emit('update:config', {
    ...props.config,
    interval: refreshInterval.value,
    showAllContainers: showAllContainers.value,
  })
  showConfig.value = false
  startPolling()
}

function startPolling() {
  stopPolling()
  fetchStats()
  timer = setInterval(fetchStats, refreshInterval.value * 1000)
}

function stopPolling() {
  if (timer) clearInterval(timer)
  timer = null
}

onMounted(startPolling)
onBeforeUnmount(stopPolling)

watch(() => props.editing, (val) => {
  if (val) stopPolling()
  else startPolling()
})
</script>

<template>
  <div class="docker-widget">

    <!-- 配置表单 -->
    <template v-if="showConfig">
      <div class="cfg">
        <div class="cfg-row">
          <label class="cfg-lbl">刷新间隔（秒）</label>
          <input v-model.number="refreshInterval" type="number" min="3" max="60" class="cfg-inp cfg-inp-sm" />
        </div>
        <label class="toggle">
          <input type="checkbox" v-model="showAllContainers" />
          <span>显示已停止的容器</span>
        </label>
        <div class="cfg-btns">
          <button class="cfg-btn no" @click="showConfig = false">取消</button>
          <button class="cfg-btn ok" @click="saveConfig">保存</button>
        </div>
      </div>
    </template>

    <!-- Docker 不可用 -->
    <template v-else-if="stats && !stats.available">
      <div class="err">
        <span class="err-icon">🐳</span>
        <span class="err-msg">{{ stats.message || 'Docker 未可用' }}</span>
      </div>
    </template>

    <!-- 错误 -->
    <template v-else-if="error">
      <div class="err">
        <span class="err-msg">{{ error }}</span>
        <span v-if="editable" class="err-retry" @click="fetchStats">重试</span>
      </div>
    </template>

    <!-- 监控面板 -->
    <template v-else-if="stats && stats.available">
      <div class="panel">
        <button v-if="editable" class="cfg-toggle" @click.stop="showConfig = true" title="配置">⚙</button>

        <!-- 头部：容器统计 -->
        <div class="head">
          <div class="head-title">
            <span class="head-icon">🐳</span>
            <span class="head-label">Docker</span>
          </div>
          <div class="head-stats">
            <span class="stat running">{{ stats.running }} 运行</span>
            <span v-if="stats.total > stats.running" class="stat stopped">{{ stats.total - stats.running }} 停止</span>
          </div>
        </div>

        <!-- 容器列表 -->
        <div class="container-list">
          <div
            v-for="c in (showAllContainers ? stats.containers : stats.containers.filter(c => c.state === 'running'))"
            :key="c.id"
            class="container"
          >
            <div class="container-head">
              <span class="container-dot" :style="{ background: getStateColor(c.state) }"></span>
              <span class="container-name" :title="c.name">{{ c.name }}</span>
              <span class="container-state">{{ getStateLabel(c.state) }}</span>
            </div>

            <div v-if="c.state === 'running'" class="container-metrics">
              <div class="metric-row">
                <span class="metric-label">CPU</span>
                <span class="metric-value" :style="{ color: getColor(c.cpuPercent) }">{{ c.cpuPercent.toFixed(1) }}%</span>
              </div>
              <div class="bar"><div class="bar-fill" :style="{ width: Math.min(c.cpuPercent, 100) + '%', background: getColor(c.cpuPercent) }"></div></div>

              <div class="metric-row">
                <span class="metric-label">MEM</span>
                <span class="metric-value" :style="{ color: getColor(c.memPercent) }">{{ c.memPercent.toFixed(1) }}%</span>
              </div>
              <div class="bar"><div class="bar-fill" :style="{ width: Math.min(c.memPercent, 100) + '%', background: getColor(c.memPercent) }"></div></div>

              <div class="metric-sub">
                <span>{{ c.memUsage }}</span>
              </div>
            </div>

            <div v-else class="container-sub">
              <span>{{ c.status }}</span>
            </div>

            <div class="container-image" :title="c.image">{{ formatImage(c.image) }}</div>
          </div>

          <div v-if="stats.containers.length === 0" class="empty">
            <span>暂无容器</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 加载 -->
    <template v-else-if="loading">
      <div class="loading">
        <div class="spin"></div>
        <span>连接 Docker...</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.docker-widget { height: 100%; width: 100%; }

.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  padding: 10px 12px;
  box-sizing: border-box;
  overflow-y: auto;
  position: relative;
}

/* 头部 */
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.head-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.head-icon { font-size: 14px; }

.head-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: var(--font-display);
}

.head-stats {
  display: flex;
  gap: 6px;
}

.stat {
  font-size: 10px;
  font-weight: 600;
  font-family: var(--font-mono);
  padding: 2px 6px;
  border-radius: 6px;
}

.stat.running {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.1);
}

.stat.stopped {
  color: var(--text-muted);
  background: rgba(128, 128, 128, 0.1);
}

/* 容器列表 */
.container-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  overflow-y: auto;
}

.container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  transition: background 0.2s;
}

.container:hover {
  background: rgba(255, 255, 255, 0.04);
}

.container-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.container-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.container-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.container-state {
  font-size: 9px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* 容器指标 */
.container-metrics {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.metric-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.metric-value {
  font-size: 11px;
  font-weight: 700;
  font-family: var(--font-mono);
}

.bar {
  height: 3px;
  background: rgba(128, 128, 128, 0.15);
  border-radius: 2px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.6s ease, background 0.3s;
}

.metric-sub {
  font-size: 9px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.container-sub {
  font-size: 10px;
  color: var(--text-muted);
}

.container-image {
  font-size: 9px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.6;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 60px;
  color: var(--text-muted);
  font-size: 12px;
}

/* 配置 */
.cfg-toggle {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 5;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  background: rgba(128, 128, 128, 0.08);
  color: var(--text-muted);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;
}

.panel:hover .cfg-toggle { opacity: 1; }
.cfg-toggle:hover { color: var(--text-primary); background: rgba(128, 128, 128, 0.15); }

.cfg {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  overflow-y: auto;
}

.cfg-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cfg-lbl {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.cfg-inp {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-primary);
  background: rgba(128, 128, 128, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 4px 8px;
  outline: none;
  width: 60px;
  text-align: center;
}

.cfg-inp:focus { border-color: var(--accent); }

.toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
}

.toggle input { accent-color: var(--accent); }

.cfg-btns {
  display: flex;
  gap: 8px;
  margin-top: auto;
}

.cfg-btn {
  flex: 1;
  padding: 6px;
  font-size: 11px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.cfg-btn.ok {
  background: var(--accent);
  color: white;
}

.cfg-btn.ok:hover { background: var(--accent-hover); }

.cfg-btn.no {
  background: rgba(128, 128, 128, 0.15);
  color: var(--text-secondary);
}

.cfg-btn.no:hover { background: rgba(128, 128, 128, 0.25); }

/* 错误 */
.err {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  padding: 16px;
  text-align: center;
}

.err-icon { font-size: 24px; opacity: 0.6; }

.err-msg {
  font-size: 11px;
  color: var(--danger);
  line-height: 1.4;
}

.err-retry {
  font-size: 11px;
  color: var(--accent);
  cursor: pointer;
}

.err-retry:hover { text-decoration: underline; }

/* 加载 */
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  color: var(--text-muted);
  font-size: 11px;
}

.spin {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(128, 128, 128, 0.2);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
```

- [ ] **Step 2: 类型检查**

Run: `cd /workspace/packages/frontend && npx vue-tsc --noEmit 2>&1 | head -20`
Expected: 无新增报错

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/src/widgets/DockerWidget.vue
git commit -m "feat: 新增 DockerWidget 组件 — 容器状态、CPU/内存实时监控"
```

---

### Task 3: 注册 DockerWidget 到组件系统

**Files:**
- Modify: `packages/frontend/src/components/WidgetRenderer.vue:17-23`
- Modify: `packages/frontend/src/components/WidgetLibrary.vue:119-125`
- Modify: `packages/frontend/src/components/WidgetLibrary.vue:31-37`

- [ ] **Step 1: 在 WidgetRenderer.vue 中注册组件**

在 `WidgetRenderer.vue` 的 `builtinComponents` 对象中添加：

```typescript
docker: defineAsyncComponent(() => import('../widgets/DockerWidget.vue')),
```

- [ ] **Step 2: 在 WidgetLibrary.vue 的 builtinWidgets 中添加条目**

```typescript
{ id: 'docker', name: 'Docker', icon: '🐳' },
```

- [ ] **Step 3: 在 WidgetLibrary.vue 的 defaultSizes 中添加默认尺寸**

```typescript
docker: { w: Math.min(4, cols), h: 4 },
```

注意：高度设为 4（比其他组件高），因为 Docker 组件需要展示多个容器的指标。

- [ ] **Step 4: 在 DashboardGrid.vue 的 widgetOptimalSize 中添加最优尺寸**

```typescript
docker: { w: 4, h: 4, minW: 3 },
```

- [ ] **Step 5: 类型检查**

Run: `cd /workspace/packages/frontend && npx vue-tsc --noEmit 2>&1 | head -20`
Expected: 无新增报错

- [ ] **Step 6: 提交**

```bash
git add packages/frontend/src/components/WidgetRenderer.vue packages/frontend/src/components/WidgetLibrary.vue packages/frontend/src/components/DashboardGrid.vue
git commit -m "feat: 注册 DockerWidget 到组件库和渲染器"
```

---

### Task 4: Docker 部署配置

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: 在 docker-compose.yml 中映射 docker.sock**

在 `services.nav.volumes` 中添加 docker.sock 映射：

```yaml
services:
  nav:
    # ... existing config ...
    volumes:
      - nav-data:/data
      - /var/run/docker.sock:/var/run/docker.sock
```

- [ ] **Step 2: 确认 Dockerfile 中 docker CLI 可用**

alpine 基础镜像默认不包含 docker CLI。在 Dockerfile 的构建阶段添加安装：

在 `Dockerfile` 的 Stage 2（`FROM node:20-alpine`）中，在 `WORKDIR /app` 之后添加：

```dockerfile
RUN apk add --no-cache docker-cli
```

- [ ] **Step 3: 提交**

```bash
git add docker-compose.yml Dockerfile
git commit -m "feat: Docker 部署映射 docker.sock 并安装 docker-cli"
```

---

### Task 5: 端到端验证

- [ ] **Step 1: 本地开发验证（非 Docker 环境）**

Run: `pnpm dev`

验证场景：
1. 组件库中显示 🐳 Docker 组件
2. 添加到画布/网格后显示"连接中..."加载状态
3. 如果本地有 Docker，显示容器列表
4. 如果没有 Docker，显示"Docker 未可用"提示
5. 配置面板可调整刷新间隔
6. 容器状态圆点颜色正确（运行中=绿色，停止=红色）

- [ ] **Step 2: Docker 环境验证**

```bash
docker compose down 2>&1
NAV_JWT_SECRET=infi-nav-secret NAV_PASSWORD=admin123 docker compose up -d --build 2>&1 | tail -5
```

验证场景：
1. 访问 http://localhost:4000
2. 添加 Docker 组件
3. 能看到当前 nav 容器自身的信息
4. 实时更新 CPU/内存使用率
5. 容器启停状态正确显示

- [ ] **Step 3: 类型检查**

Run: `cd /workspace/packages/frontend && npx vue-tsc --noEmit 2>&1 | head -20`
Expected: 无新增报错

- [ ] **Step 4: 最终提交（如有遗漏修改）**

```bash
git add -A
git commit -m "chore: Docker 容器监控组件完成"
```
