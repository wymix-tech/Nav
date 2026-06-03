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
