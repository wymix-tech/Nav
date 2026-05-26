<script setup lang="ts">
import { ref } from 'vue'
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
}>()

const expanded = ref(false)
</script>

<template>
  <div
    class="floating-panel"
    :class="{ expanded }"
    @mouseenter="expanded = true"
    @mouseleave="expanded = false"
  >
    <!-- 激活指示点 -->
    <div class="panel-dot">
      <span class="dot-ring"></span>
    </div>

    <!-- 展开内容 -->
    <div class="panel-content">
      <div class="panel-brand">Nav</div>
      <div class="panel-actions">
        <template v-if="auth.isAuthenticated">
          <button class="panel-btn primary" @click="emit('toggle-edit')">
            {{ editing ? '完成编辑' : '编辑' }}
          </button>
          <button v-if="editing" class="panel-btn" @click="emit('toggle-library')">
            {{ libraryVisible ? '✕' : '☰' }}
          </button>
          <button class="panel-btn" @click="emit('show-preferences')">⚙</button>
          <button class="panel-btn" @click="auth.logout()">退出登录</button>
        </template>
        <template v-else-if="!backendAvailable">
          <button class="panel-btn primary" @click="emit('toggle-edit')">
            {{ editing ? '完成编辑' : '编辑' }}
          </button>
        </template>
        <template v-else>
          <button class="panel-btn primary" @click="emit('login')">登录</button>
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
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow:
    0 2px 12px rgba(96, 165, 250, 0.3),
    0 0 0 0 rgba(96, 165, 250, 0.2);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.3s;
  flex-shrink: 0;
}

.panel-dot::after {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
}

.dot-ring {
  position: absolute;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1.5px solid rgba(96, 165, 250, 0.4);
  animation: pulse-ring 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.expanded .panel-dot {
  transform: scale(0.85);
  box-shadow:
    0 2px 8px rgba(96, 165, 250, 0.2),
    0 0 0 0 rgba(96, 165, 250, 0);
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
  transform: translateX(-12px) scale(0.95);
  pointer-events: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: var(--shadow-lg);
}

.expanded .panel-content {
  opacity: 1;
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

.panel-btn.primary:hover {
  box-shadow: 0 4px 16px rgba(96, 165, 250, 0.35);
  transform: translateY(-1px);
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
