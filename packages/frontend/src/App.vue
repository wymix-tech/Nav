<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import TopBar from './components/TopBar.vue'
import DashboardGrid from './components/DashboardGrid.vue'
import LoginDialog from './components/LoginDialog.vue'
import WidgetLibrary from './components/WidgetLibrary.vue'
import InstallWidgetDialog from './components/InstallWidgetDialog.vue'
import { useDashboardStore } from './stores/dashboardStore'
import { useWidgetStore } from './stores/widgetStore'
import { useAuthStore } from './stores/authStore'
import { isBackendAvailable, resetAdapter } from './services/storageAdapter'

const dashboardStore = useDashboardStore()
const widgetStore = useWidgetStore()
const authStore = useAuthStore()
const editing = ref(false)
const backendAvailable = ref(false)
const showLogin = ref(false)
const showInstall = ref(false)
const showLibrary = ref(false)
const isDragging = ref(false)

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

function toggleEdit() {
  editing.value = !editing.value
  showLibrary.value = editing.value
}
function handleLogin() { showLogin.value = true }
async function handleLoginSuccess() {
  resetAdapter()
  await Promise.all([dashboardStore.load(), widgetStore.load()])
}

function toggleLibrary() {
  showLibrary.value = !showLibrary.value
}
</script>

<template>
  <div class="app">
    <TopBar
      :editing="editing"
      :backend-available="backendAvailable"
      @toggle-edit="toggleEdit"
      @login="handleLogin"
    />

    <main class="main">
      <p v-if="dashboardStore.loading">加载中...</p>
      <DashboardGrid
        v-else-if="dashboardStore.dashboard"
        :widgets="dashboardStore.dashboard.widgets"
        :editing="editing"
        :editable="!backendAvailable || authStore.isAuthenticated"
        @remove-widget="dashboardStore.removeWidget"
        @update-config="(id, cfg) => dashboardStore.updateWidgetConfig(id, cfg)"
        @update-layout="(id, layouts) => dashboardStore.updateWidgetLayouts(id, layouts)"
      />
    </main>

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
</style>
