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
  gap: 8px;
  user-select: none;
}

.time-display {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.time-main {
  font-size: 42px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 2px;
  line-height: 1;
  color: var(--text-primary);
}

.time-seconds {
  font-size: 18px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
  opacity: 0.8;
  min-width: 1.5em;
  transition: opacity 0.3s ease;
}

.date-display {
  font-size: 13px;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
}
</style>
