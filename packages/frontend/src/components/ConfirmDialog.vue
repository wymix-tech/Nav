<script setup lang="ts">
defineProps<{
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <Teleport to="body">
    <div class="confirm-overlay" @click.self="emit('cancel')">
      <div class="confirm-dialog">
        <div class="confirm-icon" :class="{ danger }">
          <svg v-if="danger" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <svg v-else width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </div>
        <h3 class="confirm-title">{{ title }}</h3>
        <p class="confirm-message">{{ message }}</p>
        <div class="confirm-actions">
          <button class="confirm-btn cancel" @click="emit('cancel')">
            {{ cancelText ?? '取消' }}
          </button>
          <button
            class="confirm-btn"
            :class="danger ? 'danger' : 'primary'"
            @click="emit('confirm')"
          >
            {{ confirmText ?? '确认' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  animation: fadeIn 0.2s ease;
}

.confirm-dialog {
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 32px 28px 24px;
  width: 340px;
  text-align: center;
  box-shadow:
    0 8px 40px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  animation: dialogEnter 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.confirm-icon {
  width: 52px;
  height: 52px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(96, 165, 250, 0.1);
  color: var(--accent);
}

.confirm-icon.danger {
  background: rgba(248, 113, 113, 0.1);
  color: var(--danger);
}

.confirm-title {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.confirm-message {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 24px;
}

.confirm-actions {
  display: flex;
  gap: 10px;
}

.confirm-btn {
  flex: 1;
  padding: 10px 0;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  font-family: var(--font-body);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid transparent;
}

.confirm-btn.cancel {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
  border-color: rgba(255, 255, 255, 0.08);
}

.confirm-btn.cancel:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.confirm-btn.primary {
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  color: #fff;
  border: none;
  box-shadow: 0 2px 12px rgba(96, 165, 250, 0.3);
}

.confirm-btn.primary:hover {
  box-shadow: 0 4px 20px rgba(96, 165, 250, 0.4);
  transform: translateY(-1px);
}

.confirm-btn.danger {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #fff;
  border: none;
  box-shadow: 0 2px 12px rgba(239, 68, 68, 0.3);
}

.confirm-btn.danger:hover {
  box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
  transform: translateY(-1px);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes dialogEnter {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
</style>
