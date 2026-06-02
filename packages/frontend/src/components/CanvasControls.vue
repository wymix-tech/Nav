<script setup lang="ts">
import { ref } from 'vue'
import type { WidgetInstance } from '@nav/shared'
import { useCanvasStore } from '../stores/canvasStore'
import CanvasMinimap from './CanvasMinimap.vue'

const props = defineProps<{
  widgets: WidgetInstance[]
}>()

const canvas = useCanvasStore()
const showMinimap = ref(false)

function getCanvasRects() {
  return props.widgets
    .filter((w) => w.canvas)
    .map((w) => w.canvas!)
}
</script>

<template>
  <div class="canvas-controls">
    <button class="ctrl-btn" title="缩小" @click="canvas.zoomCenter(-0.1)">−</button>
    <span class="zoom-label">{{ Math.round(canvas.clampedZoom * 100) }}%</span>
    <button class="ctrl-btn" title="放大" @click="canvas.zoomCenter(0.1)">+</button>

    <div class="ctrl-divider" />

    <button class="ctrl-btn" title="适配全部" @click="canvas.fitAll(getCanvasRects())">⊞</button>
    <button class="ctrl-btn" title="重置视图" @click="canvas.resetView()">⊙</button>
    <button class="ctrl-btn" title="设为首页" @click="canvas.setHomeAsCurrent()">⌂</button>

    <div class="ctrl-divider" />

    <button
      class="ctrl-btn"
      :class="{ active: showMinimap }"
      title="全景导航"
      @click="showMinimap = !showMinimap"
    >◫</button>
  </div>

  <CanvasMinimap
    :widgets="props.widgets"
    :visible="showMinimap"
    @update:visible="showMinimap = $event"
  />
</template>

<style scoped>
.canvas-controls {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: var(--glass-bg);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
}

.ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 16px;
  font-family: var(--font-mono, monospace);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
  line-height: 1;
}

.ctrl-btn:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.08);
}

.ctrl-btn:active {
  background: rgba(255, 255, 255, 0.14);
}

.ctrl-btn.active {
  color: var(--accent);
  background: rgba(96, 165, 250, 0.12);
}

.zoom-label {
  min-width: 44px;
  text-align: center;
  font-size: 12px;
  font-family: var(--font-mono, monospace);
  font-weight: 600;
  color: var(--text-primary);
  user-select: none;
}

.ctrl-divider {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: rgba(255, 255, 255, 0.1);
}

/* 移动端适配 */
@media (max-width: 640px) {
  .canvas-controls {
    bottom: 80px;
  }
}
</style>
