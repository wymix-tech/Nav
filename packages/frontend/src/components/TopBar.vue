<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/authStore'

const auth = useAuthStore()

defineProps<{
  editing: boolean
  backendAvailable: boolean
  libraryVisible?: boolean
}>()

const emit = defineEmits<{
  'toggle-edit': []
  'login': []
  'show-preferences': []
  'toggle-library': []
  'clear-all': []
  'show-about': []
}>()

const expanded = ref(false)
const panelRef = ref<HTMLElement | null>(null)

function togglePanel() {
  expanded.value = !expanded.value
}

function handleClickOutside(e: MouseEvent) {
  if (panelRef.value && !panelRef.value.contains(e.target as Node)) {
    expanded.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div
    ref="panelRef"
    class="floating-panel"
    :class="{ expanded }"
  >
    <!-- 激活指示点 -->
    <div class="panel-dot" @click.stop="togglePanel">
      <span class="dot-ring"></span>
      <svg class="dot-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </div>

    <!-- 展开内容 -->
    <div class="panel-content">
      <div class="panel-brand">INFI.NAV</div>
      <div class="panel-actions">
        <template v-if="auth.isAuthenticated">
          <button class="panel-btn primary" @click="emit('toggle-edit')">
            {{ editing ? '完成编辑' : '编辑' }}
          </button>
          <button v-if="editing" class="panel-btn" @click="emit('toggle-library')">
            {{ libraryVisible ? '✕' : '☰' }}
          </button>
          <button v-if="editing" class="panel-btn danger" @click="emit('clear-all')">清空</button>
          <button class="panel-btn" @click="emit('show-preferences')">⚙</button>
          <button class="panel-btn" @click="auth.logout()">退出登录</button>
          <button class="panel-btn about-btn" @click="emit('show-about')">关于</button>
        </template>
        <template v-else-if="!backendAvailable">
          <button class="panel-btn primary" @click="emit('toggle-edit')">
            {{ editing ? '完成编辑' : '编辑' }}
          </button>
          <button class="panel-btn about-btn" @click="emit('show-about')">关于</button>
        </template>
        <template v-else>
          <button class="panel-btn primary" @click="emit('login')">登录</button>
          <button class="panel-btn about-btn" @click="emit('show-about')">关于</button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.floating-panel {
  position: fixed;
  bottom: 24px;
  left: 24px;
  z-index: 100;
  display: flex;
  align-items: flex-end;
  gap: 12px;
}

.panel-dot {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: radial-gradient(circle at center, rgba(96, 165, 250, 0.9) 0%, rgba(96, 165, 250, 0.4) 50%, transparent 70%);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow:
    0 2px 12px rgba(96, 165, 250, 0.4),
    inset 0 0 8px rgba(255, 255, 255, 0.2);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
              box-shadow 0.3s,
              background 0.3s;
  flex-shrink: 0;
  user-select: none;
  position: relative;
}

.dot-icon {
  width: 18px;
  height: 18px;
  color: rgba(255, 255, 255, 0.9);
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.expanded .dot-icon {
  transform: rotate(90deg);
}

.panel-dot:active {
  transform: scale(0.9);
}

.dot-ring {
  position: absolute;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1.5px solid rgba(96, 165, 250, 0.3);
  animation: pulse-ring 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  pointer-events: none;
}

.expanded .panel-dot {
  transform: scale(0.95);
  background: radial-gradient(circle at center, rgba(96, 165, 250, 1) 0%, rgba(96, 165, 250, 0.6) 40%, rgba(96, 165, 250, 0.2) 70%, transparent 85%);
  box-shadow:
    0 2px 16px rgba(96, 165, 250, 0.5),
    inset 0 0 10px rgba(255, 255, 255, 0.3);
}

.expanded .dot-ring {
  animation: none;
  opacity: 0;
}

@keyframes pulse-ring {
  0% {
    transform: scale(1);
    opacity: 0.6;
  }
  70% {
    transform: scale(1.6);
    opacity: 0;
  }
  100% {
    transform: scale(1.6);
    opacity: 0;
  }
}

.panel-content {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--glass-bg);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  padding: 8px 8px 8px 20px;
  opacity: 0;
  visibility: hidden;
  transform: translateX(-20px) scale(0.9);
  pointer-events: none;
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: var(--shadow-lg);
}

.expanded .panel-content {
  opacity: 1;
  visibility: visible;
  transform: translateX(0) scale(1);
  pointer-events: all;
}

.panel-brand {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
}

.panel-actions {
  display: flex;
  gap: 6px;
}

.panel-btn {
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
  border: 1px solid rgba(255, 255, 255, 0.08);
  white-space: nowrap;
  transition: all 0.2s;
}

.panel-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.15);
}

.panel-btn.primary {
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  border: none;
  color: white;
  box-shadow: 0 2px 8px rgba(96, 165, 250, 0.25);
}

.panel-btn.danger {
  color: var(--danger);
  border-color: rgba(248, 113, 113, 0.2);
}

.panel-btn.danger:hover {
  background: rgba(248, 113, 113, 0.12);
  border-color: rgba(248, 113, 113, 0.3);
}

.panel-btn.primary:hover {
  box-shadow: 0 4px 16px rgba(96, 165, 250, 0.35);
  transform: translateY(-1px);
}

.panel-btn.about-btn {
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  margin-left: 4px;
  padding-left: 16px;
  color: var(--text-secondary);
  font-size: 12px;
  opacity: 0.7;
}

.panel-btn.about-btn:hover {
  opacity: 1;
  color: var(--accent);
  background: rgba(96, 165, 250, 0.08);
}

/* 手机端：右下角 */
@media (max-width: 768px) {
  .floating-panel {
    bottom: 16px;
    left: auto;
    right: 16px;
    flex-direction: row-reverse;
  }

  .panel-content {
    flex-direction: row-reverse;
    padding: 8px 20px 8px 8px;
  }
}
</style>
