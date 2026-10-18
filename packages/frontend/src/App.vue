<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import TopBar from './components/TopBar.vue'
import DashboardGrid from './components/DashboardGrid.vue'
import CanvasGrid from './components/CanvasGrid.vue'
import AboutDialog from './components/AboutDialog.vue'
import LoginDialog from './components/LoginDialog.vue'
import WidgetLibrary from './components/WidgetLibrary.vue'
import InstallWidgetDialog from './components/InstallWidgetDialog.vue'
import PreferencesPanel from './components/PreferencesPanel.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import { useDashboardStore } from './stores/dashboardStore'
import { useWidgetStore } from './stores/widgetStore'
import { useAuthStore } from './stores/authStore'
import { constraints, findPlacement, type WidgetInstance } from '@nav/shared'
import type { AddWidgetRequest } from './canvas/useCanvasInsertion'
import { isBackendAvailable, resetAdapter } from './services/storageAdapter'

const dashboardStore = useDashboardStore()
const widgetStore = useWidgetStore()
const authStore = useAuthStore()
const mainElement = ref<HTMLElement | null>(null)
const libraryTop = ref(12)
let mainObserver: ResizeObserver | undefined
const canvasStage = ref<InstanceType<typeof CanvasGrid> | null>(null)
const spatial = computed(() => dashboardStore.dashboard?.layoutMode === 'canvas')
const editing = ref(false)
watch(editing, (active) =>
  window.dispatchEvent(new CustomEvent('nav-editing-changed', { detail: active })),
)
const updateApp = ref<null | (() => void)>(null)
function updateAvailable(e: Event) {
  updateApp.value = (e as CustomEvent).detail
}
const backendAvailable = ref(isBackendAvailable())
const showAbout = ref(false)
const showLogin = ref(false)
const showInstall = ref(false)
const showLibrary = ref(false)
const showPreferences = ref(false)
const showClearConfirm = ref(false)
const slideshowIndex = ref(0)
let slideshowTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  window.addEventListener('nav-update-available', updateAvailable)
  mainObserver = new ResizeObserver(() => {
    libraryTop.value = (mainElement.value?.getBoundingClientRect().top ?? 0) + 12
  })
  if (mainElement.value) mainObserver.observe(mainElement.value)
  await Promise.all([dashboardStore.load(), widgetStore.load()])
  try {
    await authStore.verify()
  } catch {
    // 无后端，忽略
  }
  backendAvailable.value = isBackendAvailable()
})

onUnmounted(() => {
  mainObserver?.disconnect()
  window.removeEventListener('nav-update-available', updateAvailable)
  if (slideshowTimer) clearInterval(slideshowTimer)
})

// 自定义网页标题
watch(
  () => dashboardStore.dashboard?.title,
  (newTitle) => {
    document.title = newTitle || 'Nav - 个人导航页'
  },
  { immediate: true },
)

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
watch(
  () => dashboardStore.dashboard?.background,
  (bg) => {
    if (slideshowTimer) clearInterval(slideshowTimer)
    slideshowTimer = null

    if (bg?.mode === 'slideshow' && bg.images && bg.images.length > 1) {
      slideshowTimer = setInterval(
        () => {
          slideshowIndex.value = (slideshowIndex.value + 1) % bg.images.length
        },
        (bg.interval ?? 30) * 1000,
      )
    }
  },
  { immediate: true },
)

watch(
  () => authStore.isAuthenticated,
  (allowed) => {
    if (backendAvailable.value && !allowed) {
      editing.value = false
      showLibrary.value = false
    }
  },
)
watch(isLightBg, (light) => document.documentElement.classList.toggle('light-theme', light), {
  immediate: true,
})
function toggleEdit() {
  if (backendAvailable.value && !authStore.isAuthenticated) return
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
function handleLogin() {
  showLogin.value = true
}
async function handleLoginSuccess() {
  resetAdapter()
  await Promise.all([dashboardStore.load(), widgetStore.load()])
}

function requestAddWidget(request: AddWidgetRequest) {
  if (!editing.value || (backendAvailable.value && !authStore.isAuthenticated)) return
  const d = dashboardStore.dashboard
  if (!d) return
  if (spatial.value) {
    void canvasStage.value?.addWidget(request)
    return
  }
  if (request.client) return
  try {
    const cols = d.baseColumns ?? d.columns,
      size = constraints[request.widgetId] ??
        widgetStore.getWidget(request.widgetId)?.manifest.size ?? { w: 4, h: 3 }
    const layout = findPlacement(
      Object.fromEntries(d.widgets.map((w) => [w.id, w.layouts.lg])),
      Math.min(size.w, cols),
      size.h,
      cols,
    )
    const w: WidgetInstance = {
      id: crypto.randomUUID(),
      widgetId: request.widgetId,
      source: request.source,
      config: {},
      layouts: { lg: layout, md: layout, sm: layout, xs: layout },
    }
    void dashboardStore.addWidget(w)
  } catch (e) {
    dashboardStore.error = (e as Error).message
  }
}
function toggleLibrary() {
  showLibrary.value = !showLibrary.value
}
</script>

<template>
  <div class="app" :class="{ 'light-theme': isLightBg, 'canvas-app': spatial }" :style="bgStyle">
    <TopBar
      :editing="editing"
      :backend-available="backendAvailable"
      :library-visible="showLibrary"
      @toggle-edit="toggleEdit"
      @login="handleLogin"
      @show-preferences="showPreferences = true"
      @toggle-library="toggleLibrary"
      @clear-all="handleClearAll"
      @show-about="showAbout = true"
    />

    <div v-if="dashboardStore.error" class="save-status error" role="alert">
      {{ dashboardStore.error }} <button @click="dashboardStore.load">重新加载</button
      ><button @click="dashboardStore.exportData">导出备份</button>
    </div>
    <div
      v-if="editing || dashboardStore.syncState.pendingChanges || dashboardStore.syncState.error"
      class="save-status"
      role="status"
    >
      <span>{{
        {
          'local-only': '已保存到本机',
          'pending-sync': '已保存到本机，等待同步',
          syncing: '正在同步',
          synced: '已同步',
          conflict: '检测到其他设备修改，请选择处理方式',
          'upgrade-required': '需要升级或恢复旧版草稿，请导出备份后处理',
          'auth-required': '需要登录才能同步',
          error: '已保存到本机，同步失败，请重试',
        }[dashboardStore.syncState.status || 'synced']
      }}</span>
      <button
        v-if="editing"
        :disabled="!dashboardStore.history.length"
        @click="dashboardStore.undo"
      >
        撤销
      </button>
      <button v-if="editing" :disabled="!dashboardStore.future.length" @click="dashboardStore.redo">
        重做
      </button>
      <button @click="dashboardStore.retry">重试同步</button
      ><button @click="dashboardStore.exportData">导出备份</button>
      <details v-if="dashboardStore.recoveryPreview" class="recovery-preview">
        <summary>比较本地与远端草稿</summary>
        <p>
          本地：{{ dashboardStore.recoveryPreview.localTitle }}；远端：{{
            dashboardStore.recoveryPreview.remoteTitle
          }}
        </p>
        <ul>
          <li
            v-for="(difference, index) in dashboardStore.recoveryPreview.differences"
            :key="index"
          >
            {{ difference }}
          </li>
        </ul>
      </details>
      <template v-if="dashboardStore.recoveryPreview"
        ><button @click="dashboardStore.resolveConflict(false)">采用远端</button
        ><button @click="dashboardStore.resolveConflict(true)">重新提交本地草稿</button></template
      >
    </div>
    <div v-if="updateApp" class="save-status">
      新版本已就绪
      <button
        :disabled="
          editing ||
          (!!dashboardStore.syncState.pendingChanges &&
            dashboardStore.syncState.status !== 'upgrade-required') ||
          !!dashboardStore.error
        "
        @click="updateApp()"
      >
        更新并刷新
      </button>
    </div>
    <main
      ref="mainElement"
      class="main"
      :class="{ 'library-open': editing && showLibrary, 'canvas-main': spatial }"
      :style="{
        maxWidth:
          dashboardStore.dashboard?.layoutMode === 'canvas' ||
          dashboardStore.dashboard?.layoutSettings?.contentWidthMode === 'fluid'
            ? 'none'
            : (dashboardStore.dashboard?.layoutSettings?.maxContentWidth ?? 1600) + 'px',
      }"
    >
      <p v-if="dashboardStore.loading">加载中...</p>
      <CanvasGrid
        ref="canvasStage"
        v-else-if="dashboardStore.dashboard?.layoutMode === 'canvas'"
        :dashboard="dashboardStore.dashboard"
        :editing="editing"
        :editable="!backendAvailable || authStore.isAuthenticated"
        @update-canvas="dashboardStore.updateCanvas"
        @set-default-camera="dashboardStore.setDefaultCamera"
        @add-widget="dashboardStore.addWidget"
        @remove-widget="dashboardStore.removeWidget"
        @update-config="dashboardStore.updateWidgetConfig"
      />
      <DashboardGrid
        v-else-if="dashboardStore.dashboard"
        :widgets="dashboardStore.dashboard.widgets"
        :editing="editing"
        :editable="!backendAvailable || authStore.isAuthenticated"
        :columns="dashboardStore.dashboard.columns"
        :base-columns="dashboardStore.dashboard.baseColumns"
        :row-height="dashboardStore.dashboard.rowHeight"
        :profiles="dashboardStore.dashboard.layoutProfiles"
        :settings="dashboardStore.dashboard.layoutSettings"
        @remove-widget="dashboardStore.removeWidget"
        @update-config="(id, cfg) => dashboardStore.updateWidgetConfig(id, cfg)"
        @update-layouts="dashboardStore.updateLayouts"
        @reset-profile="dashboardStore.resetProfile"
        @set-base="dashboardStore.setBase"
      />
    </main>

    <WidgetLibrary
      v-if="editing && (!backendAvailable || authStore.isAuthenticated)"
      :visible="showLibrary"
      :spatial="spatial"
      :top="libraryTop"
      @request-add-widget="requestAddWidget"
      @show-install="showInstall = true"
      @toggle-library="toggleLibrary"
    />

    <AboutDialog v-if="showAbout" @close="showAbout = false" />
    <LoginDialog v-if="showLogin" @close="showLogin = false" @success="handleLoginSuccess" />

    <InstallWidgetDialog v-if="showInstall" @close="showInstall = false" />

    <PreferencesPanel v-if="showPreferences" @close="showPreferences = false" />

    <ConfirmDialog
      v-if="showClearConfirm"
      title="清空所有组件"
      message="此操作不可撤销，将删除页面上所有组件及其配置。"
      confirm-text="清空"
      danger
      @confirm="confirmClearAll"
      @cancel="showClearConfirm = false"
    />
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  position: relative;
}

.canvas-app {
  height: 100dvh;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.canvas-app .canvas-main {
  flex: 1;
  min-height: 0;
  padding: 0;
  width: 100%;
}
.canvas-app .canvas-main.library-open {
  margin: 0 0 0 284px;
  width: calc(100% - 284px);
}
@media (max-width: 1099px) {
  .canvas-app:has(.canvas-main.library-open) :deep(.floating-panel) {
    bottom: 244px;
  }
  .canvas-app .canvas-main.library-open {
    margin: 0;
    width: 100%;
    padding-bottom: 220px;
  }
}
.main {
  min-height: 100dvh;
  padding: 24px;
  margin-inline: auto;
}

.save-status {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 24px;
  background: var(--bg-secondary);
  font-size: 13px;
}
.recovery-preview {
  max-width: 100%;
  overflow-wrap: anywhere;
}
.save-status.error {
  color: var(--danger);
}
@media (min-width: 1100px) {
  .main.library-open {
    margin-left: 284px;
    margin-right: 24px;
    width: calc(100% - 308px);
  }
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
