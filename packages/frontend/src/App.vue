<script setup lang="ts">
import { ref, onMounted } from 'vue'
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

onMounted(async () => {
  await Promise.all([dashboardStore.load(), widgetStore.load()])
  try {
    await authStore.verify()
  } catch {
    // 无后端，忽略
  }
  backendAvailable.value = isBackendAvailable()
})

function toggleEdit() {
  editing.value = !editing.value
}
function handleLogin() { showLogin.value = true }
async function handleLoginSuccess() {
  // 登录成功后重置 adapter 以切换到 SyncAdapter
  resetAdapter()
  await Promise.all([dashboardStore.load(), widgetStore.load()])
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

    <aside v-if="editing && (!backendAvailable || authStore.isAuthenticated)" class="sidebar">
      <WidgetLibrary @show-install="showInstall = true" />
    </aside>

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

.sidebar {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 280px;
  background: var(--glass-bg);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-left: 1px solid var(--glass-border);
  overflow-y: auto;
  z-index: 50;
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    top: auto;
    width: 100%;
    max-height: 50vh;
    border-left: none;
    border-top: 1px solid var(--glass-border);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  }
}
</style>
