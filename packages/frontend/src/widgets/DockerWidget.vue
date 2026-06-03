<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

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

// 配置状态
const containerName = ref(props.config.containerName ?? '')
const refreshInterval = ref(props.config.interval ?? 5)
const showConfig = ref(false)

// 数据状态
const container = ref<DockerContainer | null>(null)
const allContainers = ref<DockerContainer[]>([])
const error = ref('')
const loading = ref(false)
const dockerAvailable = ref(true)

let timer: ReturnType<typeof setInterval> | null = null

const isSetup = computed(() => !!containerName.value)

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
  return image.split('@')[0]
}

async function fetchContainers() {
  try {
    const res = await fetch('/api/system/docker')
    if (!res.ok) throw new Error(`请求失败 (${res.status})`)
    const data = await res.json()
    dockerAvailable.value = data.available
    allContainers.value = data.containers ?? []
  } catch {
    dockerAvailable.value = false
    allContainers.value = []
  }
}

async function fetchContainerDetail() {
  if (!containerName.value) return
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`/api/system/docker?name=${encodeURIComponent(containerName.value)}`)
    if (!res.ok) throw new Error(`请求失败 (${res.status})`)
    const data = await res.json()
    dockerAvailable.value = data.available
    if (data.containers?.length > 0) {
      container.value = data.containers[0]
    } else {
      container.value = null
      error.value = `容器 "${containerName.value}" 未找到`
    }
  } catch (e: any) {
    error.value = e.message ?? '获取容器信息失败'
    container.value = null
  } finally {
    loading.value = false
  }
}

async function fetchAll() {
  if (isSetup.value) {
    await fetchContainerDetail()
  } else {
    await fetchContainers()
  }
}

function selectContainer(name: string) {
  containerName.value = name
  emit('update:config', { ...props.config, containerName: name, interval: refreshInterval.value })
  fetchAll()
}

function saveConfig() {
  emit('update:config', {
    ...props.config,
    containerName: containerName.value,
    interval: refreshInterval.value,
  })
  showConfig.value = false
  startPolling()
}

function resetContainer() {
  containerName.value = ''
  container.value = null
  emit('update:config', { ...props.config, containerName: '' })
  fetchAll()
}

function startPolling() {
  stopPolling()
  fetchAll()
  timer = setInterval(fetchAll, refreshInterval.value * 1000)
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
          <input v-model.number="refreshInterval" type="number" min="3" max="60" class="cfg-inp" />
        </div>
        <div class="cfg-btns">
          <button class="cfg-btn no" @click="showConfig = false">取消</button>
          <button class="cfg-btn ok" @click="saveConfig">保存</button>
        </div>
      </div>
    </template>

    <!-- Docker 不可用 -->
    <template v-else-if="!dockerAvailable">
      <div class="err">
        <span class="err-icon">🐳</span>
        <span class="err-msg">Docker 未可用<br><small>请确保已映射 docker.sock</small></span>
      </div>
    </template>

    <!-- 未选择容器：显示容器列表供选择 -->
    <template v-else-if="!isSetup">
      <div class="panel">
        <div class="pick-head">
          <span class="pick-icon">🐳</span>
          <span class="pick-label">选择容器</span>
        </div>
        <div class="pick-list">
          <div
            v-for="c in allContainers"
            :key="c.id"
            class="pick-item"
            @click="selectContainer(c.name)"
          >
            <span class="pick-dot" :style="{ background: getStateColor(c.state) }"></span>
            <span class="pick-name">{{ c.name }}</span>
            <span class="pick-image">{{ formatImage(c.image) }}</span>
          </div>
          <div v-if="allContainers.length === 0" class="pick-empty">
            <span>暂无容器</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 错误 -->
    <template v-else-if="error && !container">
      <div class="err">
        <span class="err-msg">{{ error }}</span>
        <div class="err-actions">
          <span v-if="editable" class="err-retry" @click="fetchAll">重试</span>
          <span v-if="editable" class="err-retry" @click="resetContainer">更换容器</span>
        </div>
      </div>
    </template>

    <!-- 单容器详细监控 -->
    <template v-else-if="container">
      <div class="panel">
        <button v-if="editable" class="cfg-toggle" @click.stop="showConfig = true" title="配置">⚙</button>

        <!-- 头部：容器名 + 状态 -->
        <div class="head">
          <div class="head-left">
            <span class="head-dot" :style="{ background: getStateColor(container.state) }"></span>
            <span class="head-name">{{ container.name }}</span>
          </div>
          <div class="head-right">
            <span class="head-state">{{ getStateLabel(container.state) }}</span>
            <span v-if="editable" class="head-change" @click="resetContainer" title="更换容器">⇄</span>
          </div>
        </div>

        <!-- 镜像 -->
        <div class="info-row">
          <span class="info-label">镜像</span>
          <span class="info-value mono" :title="container.image">{{ formatImage(container.image) }}</span>
        </div>

        <!-- 运行状态 -->
        <div class="info-row">
          <span class="info-label">状态</span>
          <span class="info-value">{{ container.status }}</span>
        </div>

        <!-- CPU -->
        <div v-if="container.state === 'running'" class="metric">
          <div class="metric-head">
            <span class="metric-label">CPU</span>
            <span class="metric-value" :style="{ color: getColor(container.cpuPercent) }">{{ container.cpuPercent.toFixed(1) }}%</span>
          </div>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(container.cpuPercent, 100) + '%', background: getColor(container.cpuPercent) }"></div></div>
        </div>

        <!-- 内存 -->
        <div v-if="container.state === 'running'" class="metric">
          <div class="metric-head">
            <span class="metric-label">MEM</span>
            <span class="metric-value" :style="{ color: getColor(container.memPercent) }">{{ container.memPercent.toFixed(1) }}%</span>
          </div>
          <div class="bar"><div class="bar-fill" :style="{ width: Math.min(container.memPercent, 100) + '%', background: getColor(container.memPercent) }"></div></div>
          <div class="metric-sub">{{ container.memUsage }}</div>
        </div>

        <!-- 网络 / 进程 -->
        <div v-if="container.state === 'running'" class="detail-row">
          <div class="detail-item">
            <span class="detail-label">网络</span>
            <span class="detail-value mono">{{ container.netIO }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">进程</span>
            <span class="detail-value mono">{{ container.pids }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 加载 -->
    <template v-else-if="loading">
      <div class="loading">
        <div class="spin"></div>
        <span>加载中...</span>
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

/* ======== 容器选择列表 ======== */
.pick-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pick-icon { font-size: 14px; }

.pick-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: var(--font-display);
}

.pick-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  overflow-y: auto;
}

.pick-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.pick-item:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(96, 165, 250, 0.2);
}

.pick-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pick-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: var(--font-mono);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pick-image {
  font-size: 9px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 40%;
}

.pick-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 60px;
  color: var(--text-muted);
  font-size: 12px;
}

/* ======== 头部 ======== */
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.head-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.head-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.head-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.head-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.head-state {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.head-change {
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  transition: color 0.2s, background 0.2s;
}

.head-change:hover {
  color: var(--accent);
  background: rgba(96, 165, 250, 0.1);
}

/* ======== 信息行 ======== */
.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  font-size: 11px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
  text-align: right;
}

.info-value.mono {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-secondary);
}

/* ======== 指标 ======== */
.metric {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.metric-head {
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
  font-size: 13px;
  font-weight: 700;
  font-family: var(--font-mono);
}

.metric-sub {
  font-size: 9px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.bar {
  height: 4px;
  background: rgba(128, 128, 128, 0.15);
  border-radius: 2px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.6s ease, background 0.3s;
}

/* ======== 详情行 ======== */
.detail-row {
  display: flex;
  gap: 12px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
}

.detail-label {
  font-size: 9px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  font-size: 11px;
  color: var(--text-secondary);
}

.detail-value.mono {
  font-family: var(--font-mono);
  font-size: 10px;
}

/* ======== 配置 ======== */
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

.cfg-btn.ok { background: var(--accent); color: white; }
.cfg-btn.ok:hover { background: var(--accent-hover); }
.cfg-btn.no { background: rgba(128, 128, 128, 0.15); color: var(--text-secondary); }
.cfg-btn.no:hover { background: rgba(128, 128, 128, 0.25); }

/* ======== 错误 ======== */
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
  line-height: 1.5;
}

.err-actions {
  display: flex;
  gap: 12px;
}

.err-retry {
  font-size: 11px;
  color: var(--accent);
  cursor: pointer;
}

.err-retry:hover { text-decoration: underline; }

/* ======== 加载 ======== */
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
