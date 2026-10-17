import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiJson } from '../services/apiClient'
const TOKEN_KEY = 'nav_token'
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const state = ref<'checking' | 'authenticated' | 'anonymous' | 'unavailable'>(
    token.value ? 'checking' : 'anonymous',
  )
  const error = ref('')
  const isAuthenticated = computed(() => state.value === 'authenticated')
  function notify() {
    window.dispatchEvent(new Event('nav-auth-changed'))
  }
  async function login(password: string): Promise<boolean> {
    try {
      const data = await apiJson<{ token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      if (typeof data.token !== 'string') throw new Error('登录响应无效')
      token.value = data.token
      localStorage.setItem(TOKEN_KEY, data.token)
      state.value = 'authenticated'
      error.value = ''
      notify()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : '登录失败'
      return false
    }
  }
  function logout() {
    token.value = null
    state.value = 'anonymous'
    localStorage.removeItem(TOKEN_KEY)
    notify()
  }
  async function verify(): Promise<boolean> {
    const checking = token.value
    if (!checking) {
      state.value = 'anonymous'
      return false
    }
    state.value = 'checking'
    try {
      const data = await apiJson<{ valid: boolean }>('/auth/verify', { method: 'POST' })
      if (token.value !== checking) return isAuthenticated.value
      if (data.valid !== true) {
        logout()
        return false
      }
      state.value = 'authenticated'
      notify()
      return true
    } catch (e) {
      if (token.value !== checking) return isAuthenticated.value
      const status = (e as { status?: number }).status
      if (status === 401 || status === 403) logout()
      else {
        state.value = 'unavailable'
        error.value = '暂时无法验证登录，请重试'
      }
      return false
    }
  }
  window.addEventListener('nav-auth-invalid', logout)
  window.addEventListener('online', () => {
    void verify()
  })
  function getAuthHeaders(): Record<string, string> {
    return token.value ? { Authorization: `Bearer ${token.value}` } : {}
  }
  return { token, state, error, isAuthenticated, login, logout, verify, getAuthHeaders }
})
