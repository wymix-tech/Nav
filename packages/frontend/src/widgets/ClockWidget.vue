<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

defineProps<{
  config: Record<string, any>
  editing: boolean
  editable: boolean
}>()

const time = ref('')
const date = ref('')
const seconds = ref('')
let timer: ReturnType<typeof setInterval>

function updateTime() {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  seconds.value = String(now.getSeconds()).padStart(2, '0')
  time.value = `${hours}:${minutes}`
  date.value = now.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  })
}

onMounted(() => {
  updateTime()
  timer = setInterval(updateTime, 1000)
})

onUnmounted(() => {
  clearInterval(timer)
})
</script>

<template>
  <div class="clock-widget">
    <div class="time-display">
      <span class="time-main">{{ time }}</span>
      <span class="time-seconds">{{ seconds }}</span>
    </div>
    <div class="date-display">{{ date }}</div>
  </div>
</template>

<style scoped>
.clock-widget {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 6px;
  user-select: none;
}

.time-display {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.time-main {
  font-family: var(--font-display);
  font-size: 56px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -1px;
  line-height: 1;
  background: linear-gradient(135deg, #e2e8f0, #94a3b8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.time-seconds {
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--accent-warm);
  min-width: 1.5em;
  opacity: 0.9;
}

.date-display {
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
}
</style>
