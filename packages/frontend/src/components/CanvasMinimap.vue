<script setup lang="ts">
import { computed, ref } from 'vue'
import type { WidgetInstance, CanvasLayout } from '@nav/shared'
import { useCanvasStore } from '../stores/canvasStore'

const props = defineProps<{
  widgets: WidgetInstance[]
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [val: boolean]
}>()

const canvas = useCanvasStore()
const MINIMAP_W = 200
const MINIMAP_H = 140
const PADDING = 16

// 所有组件的 canvas 布局
const canvasLayouts = computed(() =>
  props.widgets
    .filter((w): w is WidgetInstance & { canvas: CanvasLayout } => w.canvas != null)
    .map((w) => w.canvas)
)

// 所有组件的包围盒
const bounds = computed(() => {
  if (canvasLayouts.value.length === 0) {
    return { minX: -200, minY: -150, maxX: 200, maxY: 150 }
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const c of canvasLayouts.value) {
    minX = Math.min(minX, c.x)
    minY = Math.min(minY, c.y)
    maxX = Math.max(maxX, c.x + c.w)
    maxY = Math.max(maxY, c.y + c.h)
  }
  return { minX, minY, maxX, maxY }
})

// 缩放比例：将包围盒映射到 minimap 可视区域
const scale = computed(() => {
  const contentW = bounds.value.maxX - bounds.value.minX || 1
  const contentH = bounds.value.maxY - bounds.value.minY || 1
  const availW = MINIMAP_W - PADDING * 2
  const availH = MINIMAP_H - PADDING * 2
  return Math.min(availW / contentW, availH / contentH, 1)
})

// 包围盒在 minimap 中的偏移（居中）
const offset = computed(() => {
  const contentW = (bounds.value.maxX - bounds.value.minX) * scale.value
  const contentH = (bounds.value.maxY - bounds.value.minY) * scale.value
  return {
    x: (MINIMAP_W - contentW) / 2,
    y: (MINIMAP_H - contentH) / 2,
  }
})

// 组件在 minimap 中的位置
function widgetRect(c: CanvasLayout) {
  return {
    left: (c.x - bounds.value.minX) * scale.value + offset.value.x,
    top: (c.y - bounds.value.minY) * scale.value + offset.value.y,
    width: c.w * scale.value,
    height: c.h * scale.value,
  }
}

// 当前视口在 minimap 中的矩形
const viewportRect = computed(() => {
  const el = canvas.canvasEl
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const zoom = canvas.clampedZoom

  // 屏幕视口 → 画布坐标
  const canvasLeft = -canvas.panX / zoom
  const canvasTop = -canvas.panY / zoom
  const canvasRight = (rect.width - canvas.panX) / zoom
  const canvasBottom = (rect.height - canvas.panY) / zoom

  return {
    left: (canvasLeft - bounds.value.minX) * scale.value + offset.value.x,
    top: (canvasTop - bounds.value.minY) * scale.value + offset.value.y,
    width: (canvasRight - canvasLeft) * scale.value,
    height: (canvasBottom - canvasTop) * scale.value,
  }
})

// 拖拽状态
const isDragging = ref(false)

function navigateFromMinimap(e: MouseEvent) {
  const el = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const minimapX = e.clientX - el.left
  const minimapY = e.clientY - el.top

  // minimap 坐标 → 画布坐标
  const canvasX = (minimapX - offset.value.x) / scale.value + bounds.value.minX
  const canvasY = (minimapY - offset.value.y) / scale.value + bounds.value.minY

  // 将视口中心移动到该画布坐标
  const container = canvas.canvasEl
  if (!container) return
  const rect = container.getBoundingClientRect()
  canvas.panX = rect.width / 2 - canvas.clampedZoom * canvasX
  canvas.panY = rect.height / 2 - canvas.clampedZoom * canvasY
}

function onPointerDown(e: PointerEvent) {
  isDragging.value = true
  navigateFromMinimap(e as unknown as MouseEvent)
  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging.value) return
  navigateFromMinimap(e as unknown as MouseEvent)
}

function onPointerUp() {
  isDragging.value = false
  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerup', onPointerUp)
}
</script>

<template>
  <Transition name="minimap-fade">
    <div v-if="visible" class="minimap-panel">
      <div class="minimap-header">
        <span class="minimap-title">全景</span>
        <button class="minimap-close" @click="emit('update:visible', false)">✕</button>
      </div>
      <div
        class="minimap-body"
        @pointerdown="onPointerDown"
      >
        <!-- 组件矩形 -->
        <div
          v-for="(c, i) in canvasLayouts"
          :key="i"
          class="minimap-widget"
          :style="{
            left: widgetRect(c).left + 'px',
            top: widgetRect(c).top + 'px',
            width: widgetRect(c).width + 'px',
            height: widgetRect(c).height + 'px',
          }"
        />
        <!-- 视口矩形 -->
        <div
          v-if="viewportRect"
          class="minimap-viewport"
          :style="{
            left: viewportRect.left + 'px',
            top: viewportRect.top + 'px',
            width: viewportRect.width + 'px',
            height: viewportRect.height + 'px',
          }"
        />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.minimap-panel {
  position: fixed;
  top: 80px;
  right: 24px;
  z-index: 100;
  width: 200px;
  background: var(--glass-bg);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.minimap-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.minimap-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  user-select: none;
}

.minimap-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.minimap-close:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.08);
}

.minimap-body {
  position: relative;
  width: 200px;
  height: 140px;
  cursor: crosshair;
  overflow: hidden;
}

.minimap-widget {
  position: absolute;
  background: rgba(96, 165, 250, 0.25);
  border: 1px solid rgba(96, 165, 250, 0.4);
  border-radius: 2px;
  pointer-events: none;
}

.minimap-viewport {
  position: absolute;
  border: 1.5px solid rgba(96, 165, 250, 0.8);
  border-radius: 2px;
  background: rgba(96, 165, 250, 0.06);
  pointer-events: none;
}

/* 过渡动画 */
.minimap-fade-enter-active,
.minimap-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.minimap-fade-enter-from,
.minimap-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
