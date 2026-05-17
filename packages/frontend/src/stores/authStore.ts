import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const TOKEN_KEY = 'nav_token'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const isAuthenticated = computed(() => !!token.value)

  async function login(password: string): Promise<boolean> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) return false
      const data = await res.json()
      token.value = data.token
      localStorage.setItem(TOKEN_KEY, data.token)
      return true
    } catch {
      return false
    }
  }

  function logout() {
    token.value = null
    localStorage.removeItem(TOKEN_KEY)
  }

  async function verify(): Promise<boolean> {
    if (!token.value) return false
    try {
      const res = await fetch('/api/auth/verify', {
        headers: { Authorization: `Bearer ${token.value}` },
      })
      if (!res.ok) {
        logout()
        return false
      }
      return true
    } catch {
      return false
    }
  }

  function getAuthHeaders(): Record<string, string> {
    if (!token.value) return {}
    return { Authorization: `Bearer ${token.value}` }
  }

  return {
    token,
    isAuthenticated,
    login,
    logout,
    verify,
    getAuthHeaders,
  }
})
