<script setup lang="ts">
import { shallowRef, watch, onUnmounted } from 'vue'
import { subscribeClock, currentClock } from '../services/clockService'
const props = withDefaults(
  defineProps<{
    config: Record<string, any>
    editing: boolean
    editable: boolean
    resourceActive?: boolean
  }>(),
  { resourceActive: true },
)
const display = shallowRef(currentClock())
let release: (() => void) | undefined
watch(
  () => props.resourceActive,
  (active) => {
    release?.()
    release = active
      ? subscribeClock('second', (value) => {
          display.value = value
        }).release
      : undefined
  },
  { immediate: true },
)
onUnmounted(() => release?.())
</script>

<template>
  <div class="clock-widget">
    <div class="time-display">
      <span class="time-main">{{ display.time }}</span>
      <span class="time-seconds">{{ display.seconds }}</span>
    </div>
    <div class="date-display">{{ display.date }}</div>
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
  font-size: clamp(32px, 15cqi, 64px);
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
