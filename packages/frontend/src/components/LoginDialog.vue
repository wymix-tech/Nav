<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../stores/authStore'

const auth = useAuthStore()
const password = ref('')
const error = ref('')
const loading = ref(false)

const emit = defineEmits<{
  close: []
  success: []
}>()

async function handleLogin() {
  if (!password.value) return
  loading.value = true
  error.value = ''
  const ok = await auth.login(password.value)
  loading.value = false
  if (ok) {
    emit('success')
    emit('close')
  } else {
    error.value = '密码错误'
  }
}
</script>

<template>
  <div class="dialog-overlay" @click.self="emit('close')">
    <div class="dialog">
      <h2>登录</h2>
      <form @submit.prevent="handleLogin">
        <input
          v-model="password"
          type="password"
          placeholder="输入访问密码"
          class="input"
          autofocus
        />
        <p v-if="error" class="error">{{ error }}</p>
        <div class="actions">
          <button type="button" @click="emit('close')">取消</button>
          <button type="submit" class="primary" :disabled="loading">
            {{ loading ? '登录中...' : '登录' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.dialog {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  width: 360px;
}

.dialog h2 {
  margin-bottom: 16px;
  font-size: 18px;
}

.input {
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
}

.input:focus {
  border-color: var(--accent);
}

.error {
  color: #ef4444;
  font-size: 13px;
  margin-top: 8px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.actions button {
  padding: 8px 20px;
  font-size: 14px;
  background-color: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.actions button.primary {
  border: none;
}
</style>
