<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import TopBar from './components/TopBar.vue'
import DashboardGrid from './components/DashboardGrid.vue'
import LoginDialog from './components/LoginDialog.vue'
import WidgetLibrary from './components/WidgetLibrary.vue'
import InstallWidgetDialog from './components/InstallWidgetDialog.vue'
import PreferencesPanel from './components/PreferencesPanel.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import AboutDialog from './components/AboutDialog.vue'
import { useDashboardStore } from './stores/dashboardStore'
import { useWidgetStore } from './stores/widgetStore'
import { useAuthStore } from './stores/authStore'
import { isBackendAvailable, resetAdapter } from './services/storageAdapter'
import CanvasControls from './components/CanvasControls.vue'

const dashboardStore = useDashboardStore()
const widgetStore = useWidgetStore()
const authStore = useAuthStore()
const editing = ref(false)
const backendAvailable = ref(false)
const showLogin = ref(false)
const showInstall = ref(false)
const showLibrary = ref(false)
const isDragging = ref(false)
const showPreferences = ref(false)
const showClearConfirm = ref(false)
const showAbout = ref(false)
const slideshowIndex = ref(0)
let slideshowTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await Promise.all([dashboardStore.load(), widgetStore.load()])
  try {
    await authStore.verify()
  } catch {
    // 无后端，忽略
  }
  backendAvailable.value = isBackendAvailable()

  // 拖拽时隐藏组件库
  document.addEventListener('dragstart', handleDragStart)
  document.addEventListener('dragend', handleDragEnd)
})

onUnmounted(() => {
  document.removeEventListener('dragstart', handleDragStart)
  document.removeEventListener('dragend', handleDragEnd)
})

function handleDragStart() {
  isDragging.value = true
}

function handleDragEnd() {
  setTimeout(() => { isDragging.value = false }, 300)
}

// 自定义网页标题
watch(() => dashboardStore.dashboard?.title, (newTitle) => {
  document.title = newTitle || 'Nav - 个人导航页'
}, { immediate: true })

// 判断颜色是否为浅色
function isLightColor(color: string): boolean {
  const hex = color.replace('#', '')
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16)
    const g = parseInt(hex[1] + hex[1], 16)
    const b = parseInt(hex[2] + hex[2], 16)
    return (r * 299 + g * 587 + b * 114) / 1000 > 128
  }
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}

// 背景亮度：浅色背景时切换主题
const isLightBg = computed(() => {
  const bg = dashboardStore.dashboard?.background
  if (!bg || bg.mode === 'color' || !bg.images || bg.images.length === 0) {
    return isLightColor(bg?.color ?? '#0c1021')
  }
  // 图片背景默认深色，用户如需浅色需手动设置纯色
  return false
})

// 背景样式
const bgStyle = computed(() => {
  const bg = dashboardStore.dashboard?.background
  if (!bg || bg.mode === 'color') {
    return { backgroundImage: 'none', backgroundColor: bg?.color ?? '#0c1021' }
  }
  if (!bg.images || bg.images.length === 0) {
    return { backgroundImage: 'none', backgroundColor: bg?.color ?? '#0c1021' }
  }
  const img = bg.images[slideshowIndex.value % bg.images.length]
  return {
    backgroundImage: `url(${img.src})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
  }
})

// 轮播定时器
watch(() => dashboardStore.dashboard?.background, (bg) => {
  if (slideshowTimer) clearInterval(slideshowTimer)
  slideshowTimer = null

  if (bg?.mode === 'slideshow' && bg.images && bg.images.length > 1) {
    slideshowTimer = setInterval(() => {
      slideshowIndex.value = (slideshowIndex.value + 1) % bg.images.length
    }, (bg.interval ?? 30) * 1000)
  }
}, { immediate: true })

function toggleEdit() {
  editing.value = !editing.value
  showLibrary.value = editing.value
}
function handleClearAll() {
  showClearConfirm.value = true
}
function confirmClearAll() {
  dashboardStore.clearAllWidgets()
  showClearConfirm.value = false
}
function handleLogin() { showLogin.value = true }
async function handleLoginSuccess() {
  resetAdapter()
  await Promise.all([dashboardStore.load(), widgetStore.load()])
}

function toggleLibrary() {
  showLibrary.value = !showLibrary.value
}

function toggleLayoutMode() {
  if (!dashboardStore.dashboard) return
  const newMode = dashboardStore.dashboard.layoutMode === 'canvas' ? 'grid' : 'canvas'
  dashboardStore.dashboard.layoutMode = newMode

  // 切换到画布模式时，将没有 canvas 坐标的组件从网格坐标转换为像素坐标
  if (newMode === 'canvas') {
    const cols = dashboardStore.dashboard.columns ?? 12
    const rowH = dashboardStore.dashboard.rowHeight ?? 80
    const margin = 10
    const containerW = window.innerWidth - 48 // 减去两侧 padding
    const colW = (containerW - (cols + 1) * margin) / cols

    for (const w of dashboardStore.dashboard.widgets) {
      if (!w.canvas) {
        const lg = w.layouts.lg
        w.canvas = {
          x: Math.round(lg.x * (colW + margin) + margin),
          y: Math.round(lg.y * (rowH + margin) + margin),
          w: Math.round(lg.w * (colW + margin) - margin),
          h: Math.round(lg.h * (rowH + margin) - margin),
        }
      }
    }
  }

  dashboardStore.save()
}
</script>

<template>
  <div class="app" :class="{ 'light-theme': isLightBg }" :style="bgStyle">
    <TopBar
      :editing="editing"
      :backend-available="backendAvailable"
      :library-visible="showLibrary"
      :layout-mode="dashboardStore.dashboard?.layoutMode"
      @toggle-edit="toggleEdit"
      @login="handleLogin"
      @show-preferences="showPreferences = true"
      @toggle-library="toggleLibrary"
      @clear-all="handleClearAll"
      @show-about="showAbout = true"
      @toggle-layout-mode="toggleLayoutMode"
    />

    <main class="main">
      <p v-if="dashboardStore.loading">加载中...</p>
      <DashboardGrid
        v-else-if="dashboardStore.dashboard"
        :widgets="dashboardStore.dashboard.widgets"
        :editing="editing"
        :editable="!backendAvailable || authStore.isAuthenticated"
        :columns="dashboardStore.dashboard.columns"
        :row-height="dashboardStore.dashboard.rowHeight"
        :layout-mode="dashboardStore.dashboard.layoutMode"
        @remove-widget="dashboardStore.removeWidget"
        @update-config="(id, cfg) => dashboardStore.updateWidgetConfig(id, cfg)"
        @update-layout="(id, layouts) => dashboardStore.updateWidgetLayouts(id, layouts)"
        @update-canvas="(id, c) => dashboardStore.updateWidgetCanvas(id, c)"
      />
    </main>

    <CanvasControls
      v-if="dashboardStore.dashboard?.layoutMode === 'canvas'"
      :widgets="dashboardStore.dashboard?.widgets ?? []"
    />

    <WidgetLibrary
      v-if="editing && (!backendAvailable || authStore.isAuthenticated)"
      :visible="showLibrary && !isDragging"
      @show-install="showInstall = true"
      @toggle-library="toggleLibrary"
    />

    <LoginDialog
      v-if="showLogin"
      @close="showLogin = false"
      @success="handleLoginSuccess"
    />

    <InstallWidgetDialog
      v-if="showInstall"
      @close="showInstall = false"
    />

    <PreferencesPanel
      v-if="showPreferences"
      @close="showPreferences = false"
    />

    <ConfirmDialog
      v-if="showClearConfirm"
      title="清空所有组件"
      message="此操作不可撤销，将删除页面上所有组件及其配置。"
      confirm-text="清空"
      danger
      @confirm="confirmClearAll"
      @cancel="showClearConfirm = false"
    />

    <AboutDialog
      v-if="showAbout"
      @close="showAbout = false"
    />
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  position: relative;
}

.main {
  min-height: 100vh;
  padding: 24px;
}

@media (max-width: 768px) {
  .main {
    padding: 12px;
  }
}

@media (max-width: 480px) {
  .main {
    padding: 8px;
  }
}
</style>
