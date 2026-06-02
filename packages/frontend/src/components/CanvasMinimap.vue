<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
const minimapEl = ref<HTMLElement | null>(null)

const MINIMAP_W = 220
const MINIMAP_H = 160
const PADDING = 12

// 小地图缩放级别（1 = 适应所有组件，>1 = 放大）
const minimapZoom = ref(1)

// 所有组件的 canvas 布局
const canvasWidgets = computed(() =>
  props.widgets.filter((w) => w.canvas).map((w) => w.canvas!)
)

// 所有组件的包围盒
const bounds = computed(() => {
  if (canvasWidgets.value.length === 0) {
    return { minX: -400, minY: -300, maxX: 400, maxY: 300 }
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const c of canvasWidgets.value) {
    minX = Math.min(minX, c.x)
    minY = Math.min(minY, c.y)
    maxX = Math.max(maxX, c.x + c.w)
    maxY = Math.max(maxY, c.y + c.h)
  }
  const pad = 150
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
})

// 画布的宽高比（浏览器视口）
const viewportAspect = computed(() => {
  if (typeof window === 'undefined') return 16 / 9
  return window.innerWidth / window.innerHeight
})

// 小地图基础缩放：包围盒映射到小地图可视区域
const baseScale = computed(() => {
  const bw = bounds.value.maxX - bounds.value.minX
  const bh = bounds.value.maxY - bounds.value.minY
  if (bw <= 0 || bh <= 0) return 0.1
  const availW = MINIMAP_W - PADDING * 2
  const availH = MINIMAP_H - PADDING * 2
  return Math.min(availW / bw, availH / bh)
})

// 实际缩放 = 基础缩放 × 用户缩放
const effectiveScale = computed(() => baseScale.value * minimapZoom.value)

// 包围盒在小地图中的偏移（居中）
const contentOffset = computed(() => {
  const bw = (bounds.value.maxX - bounds.value.minX) * effectiveScale.value
  const bh = (bounds.value.maxY - bounds.value.minY) * effectiveScale.value
  return {
    x: (MINIMAP_W - bw) / 2,
    y: (MINIMAP_H - bh) / 2,
  }
})

// 组件在小地图中的位置（返回 CSS 字符串）
const widgetStyles = computed(() =>
  canvasWidgets.value.map((c) => ({
    left: `${(c.x - bounds.value.minX) * effectiveScale.value + contentOffset.value.x}px`,
    top: `${(c.y - bounds.value.minY) * effectiveScale.value + contentOffset.value.y}px`,
    width: `${c.w * effectiveScale.value}px`,
    height: `${c.h * effectiveScale.value}px`,
  }))
)

// 视口框：按浏览器宽高比，适配包围盒大小
const viewportBox = computed(() => {
  const container = document.querySelector('.canvas-container') as HTMLElement | null
  if (!container) return null
  const rect = container.getBoundingClientRect()
  const zoom = canvas.clampedZoom

  // 画布坐标中的视口大小
  const vpW = rect.width / zoom
  const vpH = rect.height / zoom
  const vpX = -canvas.panX / zoom
  const vpY = -canvas.panY / zoom

  // 转换到小地图坐标
  const left = (vpX - bounds.value.minX) * effectiveScale.value + contentOffset.value.x
  const top = (vpY - bounds.value.minY) * effectiveScale.value + contentOffset.value.y
  const width = vpW * effectiveScale.value
  const height = vpH * effectiveScale.value

  return { left, top, width, height }
})

// ====== 拖拽视口框定位 ======
const isDraggingViewport = ref(false)
let dragStartX = 0
let dragStartY = 0
let dragStartPanX = 0
let dragStartPanY = 0

function onViewportDragStart(e: PointerEvent) {
  e.stopPropagation()
  isDraggingViewport.value = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  dragStartPanX = canvas.panX
  dragStartPanY = canvas.panY
  document.addEventListener('pointermove', onViewportDragMove)
  document.addEventListener('pointerup', onViewportDragEnd)
}

function onViewportDragMove(e: PointerEvent) {
  if (!isDraggingViewport.value) return
  const zoom = canvas.clampedZoom
  const dx = (e.clientX - dragStartX) / zoom
  const dy = (e.clientY - dragStartY) / zoom
  canvas.panX = dragStartPanX - dx * zoom
  canvas.panY = dragStartPanY - dy * zoom
}

function onViewportDragEnd() {
  isDraggingViewport.value = false
  document.removeEventListener('pointermove', onViewportDragMove)
  document.removeEventListener('pointerup', onViewportDragEnd)
}

// ====== 点击小地图背景跳转 ======
function onMinimapBgClick(e: PointerEvent) {
  if (isDraggingViewport.value) return
  if (!minimapEl.value) return
  const rect = minimapEl.value.querySelector('.minimap-body')?.getBoundingClientRect()
  if (!rect) return

  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top

  // 小地图坐标 → 包围盒坐标
  const cx = (mx - contentOffset.value.x) / effectiveScale.value + bounds.value.minX
  const cy = (my - contentOffset.value.y) / effectiveScale.value + bounds.value.minY

  // 将该点移到视口中心
  const container = document.querySelector('.canvas-container') as HTMLElement | null
  if (!container) return
  const cRect = container.getBoundingClientRect()
  canvas.panX = -(cx * canvas.clampedZoom - cRect.width / 2)
  canvas.panY = -(cy * canvas.clampedZoom - cRect.height / 2)
}

// ====== 小地图缩放 ======
function zoomMinimap(delta: number) {
  minimapZoom.value = Math.max(0.3, Math.min(5, minimapZoom.value + delta))
}

function fitMinimap() {
  minimapZoom.value = 1
}
</script>

<template>
  <Transition name="minimap-fade">
    <div v-if="visible" class="minimap" ref="minimapEl">
      <div class="minimap-header">
        <span class="minimap-title">全景</span>
        <div class="minimap-zoom-btns">
          <button class="zoom-btn" @click="zoomMinimap(-0.2)" title="缩小">−</button>
          <button class="zoom-btn" @click="fitMinimap" title="适应">⊙</button>
          <button class="zoom-btn" @click="zoomMinimap(0.2)" title="放大">+</button>
        </div>
        <button class="minimap-close" @click="emit('update:visible', false)">✕</button>
      </div>
      <div class="minimap-body" @pointerdown="onMinimapBgClick">
        <!-- 组件缩略 -->
        <div
          v-for="(style, i) in widgetStyles"
          :key="i"
          class="mini-widget"
          :style="style"
        />
        <!-- 视口框（可拖拽） -->
        <div
          v-if="viewportBox"
          class="mini-viewport"
          :class="{ dragging: isDraggingViewport }"
          :style="{
            left: viewportBox.left + 'px',
            top: viewportBox.top + 'px',
            width: viewportBox.width + 'px',
            height: viewportBox.height + 'px',
          }"
          @pointerdown="onViewportDragStart"
        />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.minimap {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 100;
  width: 220px;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.minimap-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px 4px;
}

.minimap-title {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.minimap-zoom-btns {
  display: flex;
  gap: 2px;
  margin-left: auto;
  margin-right: 4px;
}

.zoom-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.zoom-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.minimap-close {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  background: none;
  color: var(--text-muted);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
}

.minimap-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.minimap-body {
  position: relative;
  width: 220px;
  height: 160px;
  cursor: crosshair;
}

.mini-widget {
  position: absolute;
  background: rgba(96, 165, 250, 0.2);
  border: 1px solid rgba(96, 165, 250, 0.35);
  border-radius: 2px;
}

.mini-viewport {
  position: absolute;
  border: 2px solid var(--accent);
  background: rgba(96, 165, 250, 0.06);
  border-radius: 2px;
  cursor: grab;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.mini-viewport:hover {
  border-color: rgba(96, 165, 250, 1);
  box-shadow: 0 0 8px rgba(96, 165, 250, 0.3);
}

.mini-viewport.dragging {
  cursor: grabbing;
  border-color: rgba(96, 165, 250, 1);
  box-shadow: 0 0 12px rgba(96, 165, 250, 0.4);
}

/* 动画 */
.minimap-fade-enter-active,
.minimap-fade-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.minimap-fade-enter-from,
.minimap-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}
</style>
