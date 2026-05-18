<script setup lang="ts">
import { useAuthStore } from '../stores/authStore'

const auth = useAuthStore()

defineProps<{
  editing: boolean
  backendAvailable: boolean
}>()

const emit = defineEmits<{
  'toggle-edit': []
  'login': []
}>()
</script>

<template>
  <header class="topbar">
    <div class="topbar-left">
      <h1 class="logo">Nav</h1>
    </div>
    <div class="topbar-right">
      <template v-if="auth.isAuthenticated">
        <button class="primary" @click="emit('toggle-edit')">
          {{ editing ? '完成编辑' : '编辑' }}
        </button>
        <button @click="auth.logout()">退出登录</button>
      </template>
      <template v-else-if="!backendAvailable">
        <button class="primary" @click="emit('toggle-edit')">
          {{ editing ? '完成编辑' : '编辑' }}
        </button>
      </template>
      <template v-else>
        <button class="primary" @click="emit('login')">登录</button>
      </template>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}

.logo {
  font-size: 20px;
  font-weight: 700;
}

.topbar-right {
  display: flex;
  gap: 8px;
}

button {
  padding: 6px 16px;
  font-size: 13px;
  background-color: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

button.primary {
  border: none;
}
</style>
