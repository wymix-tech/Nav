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

interface SystemStats {
  cpu: { usage: number; cores: number; model: string; temp: number | null }
  memory: { total: number; used: number; percent: number }
  gpu: { name: string; usage: number; temp: number | null; memUsed: number; memTotal: number } | null
  disks: { path: string; total: number; used: number; percent: number }[]
  uptime: string
  hostname: string
  platform: string
  loadavg: number[]
}

const stats = ref<SystemStats | null>(null)
const error = ref('')
const loading = ref(false)
const showConfig = ref(false)

const diskPaths = ref<string[]>(props.config.diskPaths ?? ['/'])
const refreshInterval = ref(props.config.interval ?? 5)
const newDiskPath = ref('')
const displayName = ref(props.config.displayName ?? '')
const editingName = ref(false)
const nameInput = ref('')

// 各项显示开关
const showCPU = ref(props.config.showCPU ?? true)
const showMem = ref(props.config.showMem ?? true)
const showGPU = ref(props.config.showGPU ?? true)
const showDisk = ref(props.config.showDisk ?? true)
const showHeader = ref(props.config.showHeader ?? true)
const showLoadavg = ref(props.config.showLoadavg ?? true)

let timer: ReturnType<typeof setInterval> | null = null

function getColor(pct: number): string {
  if (pct >= 90) return '#ef4444'
  if (pct >= 70) return '#f59e0b'
  return '#22c55e'
}

function getTempColor(temp: number | null): string {
  if (temp === null) return 'var(--text-muted)'
  if (temp >= 80) return '#ef4444'
  if (temp >= 60) return '#f59e0b'
  return '#22c55e'
}

async function fetchStats() {
  loading.value = true
  error.value = ''
  try {
    const paths = diskPaths.value.length > 0 ? diskPaths.value.join(',') : '/'
    const res = await fetch(`/api/system/stats?disks=${encodeURIComponent(paths)}`)
    if (!res.ok) throw new Error(`请求失败 (${res.status})`)
    stats.value = await res.json()
  } catch (e: any) {
    error.value = e.message ?? '获取系统信息失败'
    stats.value = null
  } finally {
    loading.value = false
  }
}

function addDiskPath() {
  const p = newDiskPath.value.trim()
  if (p && !diskPaths.value.includes(p)) {
    diskPaths.value.push(p)
    newDiskPath.value = ''
  }
}

function removeDiskPath(index: number) {
  diskPaths.value.splice(index, 1)
}

function saveConfig() {
  emit('update:config', {
    ...props.config,
    diskPaths: diskPaths.value,
    interval: refreshInterval.value,
    showCPU: showCPU.value,
    showMem: showMem.value,
    showGPU: showGPU.value,
    showDisk: showDisk.value,
    showHeader: showHeader.value,
    showLoadavg: showLoadavg.value,
    displayName: displayName.value,
  })
  showConfig.value = false
  startPolling()
}

function startEditName() {
  nameInput.value = displayName.value || stats.value?.hostname || ''
  editingName.value = true
}

function saveName() {
  displayName.value = nameInput.value.trim()
  editingName.value = false
  emit('update:config', { ...props.config, displayName: displayName.value })
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

// 编辑模式下暂停轮询
watch(() => props.editing, (val) => {
  if (val) stopPolling()
  else startPolling()
})
</script>

<template>
  <div class="monitor-widget">

    <!-- 配置表单 -->
    <template v-if="showConfig">
      <div class="cfg">
        <div class="cfg-row">
          <label class="cfg-lbl">刷新间隔（秒）</label>
          <input v-model.number="refreshInterval" type="number" min="2" max="60" class="cfg-inp cfg-inp-sm" />
        </div>
        <div class="cfg-lbl">显示项目</div>
        <div class="toggle-list">
          <label class="toggle"><input type="checkbox" v-model="showHeader" /><span>主机信息</span></label>
          <label class="toggle"><input type="checkbox" v-model="showCPU" /><span>CPU</span></label>
          <label class="toggle"><input type="checkbox" v-model="showMem" /><span>内存</span></label>
          <label class="toggle"><input type="checkbox" v-model="showGPU" /><span>GPU</span></label>
          <label class="toggle"><input type="checkbox" v-model="showDisk" /><span>磁盘</span></label>
          <label class="toggle"><input type="checkbox" v-model="showLoadavg" /><span>负载</span></label>
        </div>
        <div class="cfg-lbl">监控磁盘路径</div>
        <div class="disk-list">
          <div v-for="(p, i) in diskPaths" :key="i" class="disk-tag">
            <span>{{ p }}</span>
            <button class="disk-rm" @click="removeDiskPath(i)">✕</button>
          </div>
        </div>
        <div class="disk-add">
          <input v-model="newDiskPath" type="text" placeholder="/path/to/disk" class="cfg-inp" @keyup.enter="addDiskPath" />
          <button class="cfg-btn ok" @click="addDiskPath">添加</button>
        </div>
        <div class="cfg-btns">
          <button class="cfg-btn no" @click="showConfig = false">取消</button>
          <button class="cfg-btn ok" @click="saveConfig">保存</button>
        </div>
      </div>
    </template>

    <!-- 配置入口 -->
    <template v-else-if="editable && !stats && !loading">
      <div class="prompt" @click="showConfig = true">
        <span class="prompt-icon">⚙</span>
        <span class="prompt-txt">点击配置监控</span>
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
    <template v-else-if="stats">
      <div class="panel">
        <!-- 配置按钮 -->
        <button v-if="editable && !editing" class="cfg-toggle" @click.stop="showConfig = true" title="配置">⚙</button>

        <!-- 头部：主机名 + 运行时间 -->
        <div v-if="showHeader" class="head">
          <div class="hostname-wrap">
            <input
              v-if="editingName"
              v-model="nameInput"
              class="hostname-input"
              maxlength="20"
              @blur="saveName"
              @keyup.enter="saveName"
              @keyup.escape="editingName = false"
            />
            <span
              v-else
              class="hostname"
              :class="{ editable: editable }"
              @click="editable ? startEditName() : undefined"
            >{{ displayName || stats.hostname }}</span>
          </div>
          <span class="uptime">{{ stats.uptime }}</span>
        </div>

        <!-- CPU -->
        <div v-if="showCPU" class="metric">
          <div class="metric-head">
            <span class="metric-label">CPU</span>
            <span class="metric-value" :style="{ color: getColor(stats.cpu.usage) }">{{ stats.cpu.usage }}%</span>
          </div>
          <div class="bar"><div class="bar-fill" :style="{ width: stats.cpu.usage + '%', background: getColor(stats.cpu.usage) }"></div></div>
          <div class="metric-sub">
            <span>{{ stats.cpu.cores }} 核</span>
            <span v-if="stats.cpu.temp !== null" :style="{ color: getTempColor(stats.cpu.temp) }">{{ stats.cpu.temp }}°C</span>
            <span v-if="showLoadavg">负载 {{ stats.loadavg.join(' / ') }}</span>
          </div>
        </div>

        <!-- 内存 -->
        <div v-if="showMem" class="metric">
          <div class="metric-head">
            <span class="metric-label">内存</span>
            <span class="metric-value" :style="{ color: getColor(stats.memory.percent) }">{{ stats.memory.percent }}%</span>
          </div>
          <div class="bar"><div class="bar-fill" :style="{ width: stats.memory.percent + '%', background: getColor(stats.memory.percent) }"></div></div>
          <div class="metric-sub">
            <span>{{ stats.memory.used }} / {{ stats.memory.total }} GB</span>
          </div>
        </div>

        <!-- GPU（如果有） -->
        <template v-if="showGPU && stats.gpu">
          <div class="metric">
            <div class="metric-head">
              <span class="metric-label">GPU</span>
              <span class="metric-value" :style="{ color: getColor(stats.gpu.usage) }">{{ stats.gpu.usage }}%</span>
            </div>
            <div class="bar"><div class="bar-fill" :style="{ width: stats.gpu.usage + '%', background: getColor(stats.gpu.usage) }"></div></div>
            <div class="metric-sub">
              <span>{{ stats.gpu.name }}</span>
              <span v-if="stats.gpu.temp !== null" :style="{ color: getTempColor(stats.gpu.temp) }">{{ stats.gpu.temp }}°C</span>
              <span>{{ stats.gpu.memUsed }} / {{ stats.gpu.memTotal }} MB</span>
            </div>
          </div>
        </template>

        <!-- 磁盘 -->
        <template v-if="showDisk">
          <div v-for="disk in stats.disks" :key="disk.path" class="metric">
            <div class="metric-head">
              <span class="metric-label disk-path" :title="disk.path">{{ disk.path }}</span>
              <span class="metric-value" :style="{ color: getColor(disk.percent) }">{{ disk.percent }}%</span>
            </div>
          <div class="bar"><div class="bar-fill" :style="{ width: disk.percent + '%', background: getColor(disk.percent) }"></div></div>
          <div class="metric-sub">
            <span>{{ disk.used }} / {{ disk.total }} GB</span>
          </div>
        </div>
        </template>

        <!-- 平台信息 -->
        <div class="foot">
          <span>{{ stats.platform }}</span>
        </div>
      </div>
    </template>

    <!-- 加载 -->
    <template v-else-if="loading">
      <div class="loading">
        <div class="spin"></div>
        <span>采集数据...</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.monitor-widget { height: 100%; width: 100%; }

/* ======== 面板 ======== */
.panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
.hostname { font-size: 12px; font-weight: 600; color: var(--text-primary); font-family: var(--font-mono); }
.hostname.editable { cursor: pointer; border-bottom: 1px dashed rgba(255,255,255,0.15); }
.hostname.editable:hover { color: var(--accent); border-bottom-color: var(--accent); }
.hostname-input {
  font-size: 12px; font-weight: 600; font-family: var(--font-mono);
  color: var(--text-primary); background: rgba(128,128,128,0.1);
  border: 1px solid var(--accent); border-radius: 4px;
  padding: 1px 4px; outline: none; width: 120px;
}
.uptime { font-size: 10px; color: var(--text-muted); }

/* ---- 指标行 ---- */
.metric { display: flex; flex-direction: column; gap: 3px; }

.metric-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.metric-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.disk-path {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: none;
  letter-spacing: 0;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-value {
  font-size: 13px;
  font-weight: 700;
  font-family: var(--font-mono);
}

.metric-sub {
  display: flex;
  gap: 8px;
  font-size: 10px;
  color: var(--text-muted);
}

/* ---- 进度条 ---- */
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

/* ---- 配置 ---- */
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
  transition: opacity 0.2s;
}

.panel:hover .cfg-toggle { opacity: 1; }
.cfg-toggle:hover { background: rgba(128, 128, 128, 0.15); color: var(--text-primary); }

/* ---- 配置表单 ---- */
.cfg {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  justify-content: center;
  padding: 8px;
  box-sizing: border-box;
  overflow-y: auto;
}

.cfg-row { display: flex; align-items: center; gap: 8px; }
.cfg-lbl { font-size: 11px; color: var(--text-muted); font-weight: 600; }
.cfg-inp {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--glass-border);
  background: rgba(128, 128, 128, 0.06);
  color: var(--text-primary);
  font-size: 12px;
  font-family: var(--font-mono);
  outline: none;
  pointer-events: all;
}
.cfg-inp:focus { border-color: rgba(96, 165, 250, 0.4); }
.cfg-inp-sm { width: 60px; text-align: center; }

.disk-list { display: flex; flex-wrap: wrap; gap: 4px; }
.disk-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: rgba(128, 128, 128, 0.08);
  border-radius: 6px;
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
}
.disk-rm {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  background: none;
  color: var(--text-muted);
  border: none;
  cursor: pointer;
  padding: 0;
  border-radius: 3px;
}
.disk-rm:hover { color: var(--danger); background: rgba(239, 68, 68, 0.1); }

.disk-add { display: flex; gap: 6px; }
.disk-add .cfg-inp { flex: 1; }

.toggle-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
}

.toggle input[type="checkbox"] {
  width: 14px;
  height: 14px;
  accent-color: var(--accent);
  cursor: pointer;
}

.cfg-btns { display: flex; gap: 6px; margin-top: 4px; }
.cfg-btn {
  flex: 1;
  padding: 6px;
  border-radius: 8px;
  border: none;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.cfg-btn.no { background: rgba(128, 128, 128, 0.08); color: var(--text-muted); }
.cfg-btn.ok { background: rgba(96, 165, 250, 0.8); color: #fff; }

/* ---- 配置入口 ---- */
.prompt { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; cursor: pointer; opacity: .5; }
.prompt:hover { opacity: .9; }
.prompt-icon { font-size: 20px; }
.prompt-txt { font-size: 13px; color: var(--text-muted); }

/* ---- 错误 ---- */
.err { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; }
.err-msg { color: var(--danger); font-size: 12px; text-align: center; }
.err-retry { font-size: 11px; color: var(--accent); cursor: pointer; text-decoration: underline; }

/* ---- 加载 ---- */
.loading { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 10px; color: var(--text-muted); font-size: 12px; }
.spin { width: 22px; height: 22px; border: 2px solid rgba(128, 128, 128, 0.15); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ---- 脚注 ---- */
.foot { margin-top: auto; font-size: 9px; color: var(--text-muted); text-align: right; opacity: 0.5; }
</style>
