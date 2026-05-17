<script setup lang="ts">
import { ref, onMounted } from 'vue'
import TopBar from './components/TopBar.vue'
import { useDashboardStore } from './stores/dashboardStore'
import { useWidgetStore } from './stores/widgetStore'
import { useAuthStore } from './stores/authStore'

const dashboardStore = useDashboardStore()
const widgetStore = useWidgetStore()
const authStore = useAuthStore()
const editing = ref(false)

onMounted(async () => {
  await Promise.all([dashboardStore.load(), widgetStore.load()])
  try {
    await authStore.verify()
  } catch {
    // 无后端，忽略
  }
})

function toggleEdit() {
  editing.value = !editing.value
}

function handleLogin() {
  // TODO: 弹出登录对话框
}
</script>

<template>
  <div class="app">
    <TopBar :editing="editing" @toggle-edit="toggleEdit" @login="handleLogin" />
    <main class="main">
      <p v-if="dashboardStore.loading">加载中...</p>
      <p v-else>仪表盘已加载，共 {{ dashboardStore.dashboard?.widgets.length ?? 0 }} 个组件</p>
    </main>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main {
  flex: 1;
  padding: 24px;
}
</style>
