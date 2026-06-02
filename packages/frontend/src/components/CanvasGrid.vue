<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { WidgetInstance, CanvasLayout } from '@nav/shared'
import { useCanvasStore } from '../stores/canvasStore'
import { useDashboardStore } from '../stores/dashboardStore'
import WidgetWrapper from './WidgetWrapper.vue'

const props = defineProps<{
  widgets: WidgetInstance[]
  editing: boolean
  editable: boolean
}>()

const emit = defineEmits<{
  'update-layout': [instanceId: string, canvas: CanvasLayout]
  'remove-widget': [instanceId: string]
  'update-config': [instanceId: string, config: Record<string, any>]
}>()

const canvasStore = useCanvasStore()
const dashboardStore = useDashboardStore()

// --- 引用 ---
const containerRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)

// --- 平移状态 ---
const isPanning = ref(false)
const spaceHeld = ref(false)
let panStartX = 0
let panStartY = 0
let panOriginX = 0
let panOriginY = 0

// --- 缩放状态 ---
const ZOOM_STEP = 0.002

// --- 拖拽状态 ---
interface DragState {
  widgetId: string
  startMouseX: number
  startMouseY: number
  startCanvasX: number
  startCanvasY: number
}

const dragState = ref<DragState | null>(null)

// --- 缩放调整状态 ---
interface ResizeState {
  widgetId: string
  startMouseX: number
  startMouseY: number
  startW: number
  startH: number
  startCanvasX: number
  startCanvasY: number
}

const resizeState = ref<ResizeState | null>(null)
const hoveredWidgetId = ref<string | null>(null)

// --- 计算属性 ---
const contentTransform = computed(() => ({
  transform: `translate(${canvasStore.panX}px, ${canvasStore.panY}px) scale(${canvasStore.clampedZoom})`,
  transformOrigin: '0 0',
}))

// 点阵网格背景样式：随 pan/zoom 同步移动
const gridBgStyle = computed(() => {
  const dotSpacing = 24 * canvasStore.clampedZoom
  const dotSize = Math.max(1, 1.2 * canvasStore.clampedZoom)
  return {
    backgroundSize: `${dotSpacing}px ${dotSpacing}px`,
    backgroundPosition: `${canvasStore.panX}px ${canvasStore.panY}px`,
    backgroundImage: `radial-gradient(circle, rgba(255, 255, 255, 0.12) ${dotSize}px, transparent ${dotSize}px)`,
  }
})

// --- 生命周期 ---
onMounted(() => {
  if (contentRef.value) {
    canvasStore.canvasEl = contentRef.value as HTMLElement
  }
  // 从 dashboard 恢复 viewport
  const vp = dashboardStore.dashboard?.viewport
  if (vp) canvasStore.restoreFromViewport(vp)
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('keyup', onKeyUp)
})

// --- viewport 持久化（防抖 500ms） ---
let saveTimer: ReturnType<typeof setTimeout> | null = null
function debouncedSaveViewport() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (dashboardStore.dashboard) {
      dashboardStore.dashboard.viewport = canvasStore.getViewport()
      dashboardStore.save()
    }
  }, 500)
}

watch([() => canvasStore.panX, () => canvasStore.panY, () => canvasStore.zoom], debouncedSaveViewport)

onUnmounted(() => {
  canvasStore.canvasEl = null
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('keyup', onKeyUp)
  removePanListeners()
  removeDragListeners()
  removeResizeListeners()
})

// --- 键盘事件：空格键控制平移模式 ---
function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault()
    spaceHeld.value = true
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') {
    spaceHeld.value = false
    if (isPanning.value) endPan()
  }
}

// --- 平移 ---
function startPan(clientX: number, clientY: number) {
  isPanning.value = true
  panStartX = clientX
  panStartY = clientY
  panOriginX = canvasStore.panX
  panOriginY = canvasStore.panY
  document.addEventListener('pointermove', onPanMove)
  document.addEventListener('pointerup', onPanUp)
}

function onPanMove(e: PointerEvent) {
  if (!isPanning.value) return
  canvasStore.panX = panOriginX + (e.clientX - panStartX)
  canvasStore.panY = panOriginY + (e.clientY - panStartY)
}

function onPanUp() {
  endPan()
}

function endPan() {
  isPanning.value = false
  removePanListeners()
}

function removePanListeners() {
  document.removeEventListener('pointermove', onPanMove)
  document.removeEventListener('pointerup', onPanUp)
}

// --- 容器指针事件：触发平移/缩放 ---
function onContainerPointerDown(e: PointerEvent) {
  // 中键或空格+左键 → 平移
  if (e.button === 1 || (e.button === 0 && spaceHeld.value)) {
    e.preventDefault()
    startPan(e.clientX, e.clientY)
    return
  }
}

function onContainerWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    const rect = containerRef.value?.getBoundingClientRect()
    if (!rect) return
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const delta = -e.deltaY * ZOOM_STEP
    canvasStore.zoomAt(mouseX, mouseY, delta)
  }
}

// --- 双击回到首页 ---
function onDoubleClick() {
  canvasStore.resetView()
}

// --- 拖拽组件 ---
function onWidgetPointerDown(e: PointerEvent, widget: WidgetInstance) {
  if (!props.editing || e.button !== 0) return
  // 拖拽手柄区域检测（点击到手柄才拖拽）
  const target = e.target as HTMLElement
  if (!target.closest('.canvas-drag-handle')) return

  e.preventDefault()
  e.stopPropagation()

  const canvas = widget.canvas ?? { x: 0, y: 0, w: 200, h: 120 }
  dragState.value = {
    widgetId: widget.id,
    startMouseX: e.clientX,
    startMouseY: e.clientY,
    startCanvasX: canvas.x,
    startCanvasY: canvas.y,
  }
  document.addEventListener('pointermove', onDragMove)
  document.addEventListener('pointerup', onDragUp)
}

function onDragMove(e: PointerEvent) {
  if (!dragState.value) return
  const dx = (e.clientX - dragState.value.startMouseX) / canvasStore.clampedZoom
  const dy = (e.clientY - dragState.value.startMouseY) / canvasStore.clampedZoom
  const newX = dragState.value.startCanvasX + dx
  const newY = dragState.value.startCanvasY + dy

  const widget = props.widgets.find((w) => w.id === dragState.value!.widgetId)
  if (!widget) return
  const canvas = widget.canvas ?? { x: 0, y: 0, w: 200, h: 120 }
  emit('update-layout', widget.id, {
    x: Math.round(newX),
    y: Math.round(newY),
    w: canvas.w,
    h: canvas.h,
  })
}

function onDragUp() {
  dragState.value = null
  removeDragListeners()
}

function removeDragListeners() {
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragUp)
}

// --- 调整组件大小 ---
function onResizePointerDown(e: PointerEvent, widget: WidgetInstance) {
  if (!props.editing || e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()

  const canvas = widget.canvas ?? { x: 0, y: 0, w: 200, h: 120 }
  resizeState.value = {
    widgetId: widget.id,
    startMouseX: e.clientX,
    startMouseY: e.clientY,
    startW: canvas.w,
    startH: canvas.h,
    startCanvasX: canvas.x,
    startCanvasY: canvas.y,
  }
  document.addEventListener('pointermove', onResizeMove)
  document.addEventListener('pointerup', onResizeUp)
}

function onResizeMove(e: PointerEvent) {
  if (!resizeState.value) return
  const { widgetId, startMouseX, startMouseY, startW, startH } = resizeState.value
  const dx = (e.clientX - startMouseX) / canvasStore.clampedZoom
  const dy = (e.clientY - startMouseY) / canvasStore.clampedZoom
  const newW = Math.max(100, startW + dx)
  const newH = Math.max(60, startH + dy)

  const widget = props.widgets.find((w) => w.id === widgetId)
  if (!widget) return
  const canvas = widget.canvas ?? { x: 0, y: 0, w: 200, h: 120 }
  if (Math.round(newW) === canvas.w && Math.round(newH) === canvas.h) return

  emit('update-layout', widgetId, {
    x: canvas.x,
    y: canvas.y,
    w: Math.round(newW),
    h: Math.round(newH),
  })
}

function onResizeUp() {
  resizeState.value = null
  removeResizeListeners()
}

function removeResizeListeners() {
  document.removeEventListener('pointermove', onResizeMove)
  document.removeEventListener('pointerup', onResizeUp)
}

// --- 获取组件画布布局 ---
function getCanvasLayout(widget: WidgetInstance): CanvasLayout {
  return widget.canvas ?? { x: 0, y: 0, w: 200, h: 120 }
}

function widgetStyle(widget: WidgetInstance) {
  const c = getCanvasLayout(widget)
  return {
    position: 'absolute' as const,
    left: `${c.x}px`,
    top: `${c.y}px`,
    width: `${c.w}px`,
    height: `${c.h}px`,
  }
}
</script>

<template>
  <div
    ref="containerRef"
    class="canvas-container"
    :class="{ panning: isPanning || spaceHeld }"
    @pointerdown="onContainerPointerDown"
    @wheel.prevent="onContainerWheel"
    @dblclick="onDoubleClick"
  >
    <!-- 点阵网格背景 -->
    <div class="canvas-grid-bg" :style="gridBgStyle" />

    <!-- 画布内容层 -->
    <div ref="contentRef" class="canvas-content" :style="contentTransform">
      <div
        v-for="widget in widgets"
        :key="widget.id"
        class="canvas-widget"
        :style="widgetStyle(widget)"
        @pointerenter="hoveredWidgetId = widget.id"
        @pointerleave="hoveredWidgetId = null"
        @pointerdown="onWidgetPointerDown($event, widget)"
      >
        <!-- 拖拽手柄（编辑模式可见） -->
        <div
          v-if="editing"
          class="canvas-drag-handle"
        />
        <div class="canvas-widget-body">
          <WidgetWrapper
            :widget="widget"
            :editing="editing"
            :editable="editable"
            @remove="emit('remove-widget', widget.id)"
            @update-config="(config) => emit('update-config', widget.id, config)"
          />
        </div>
        <!-- 缩放手柄 -->
        <div
          v-if="editing"
          class="resize-handle"
          @pointerdown="onResizePointerDown($event, widget)"
        />
        <!-- 尺寸标注 -->
        <div
          v-if="editing && resizeState?.widgetId === widget.id"
          class="resize-dimension"
        >
          {{ getCanvasLayout(widget).w }}×{{ getCanvasLayout(widget).h }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.canvas-container {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  user-select: none;
  touch-action: none;
}

.canvas-container.panning {
  cursor: grabbing;
}

/* 点阵网格背景 */
.canvas-grid-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

/* 画布内容层：平移和缩放 */
.canvas-content {
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
}

/* 单个组件容器 */
.canvas-widget {
  border-radius: var(--radius-md, 12px);
  transition: box-shadow 0.2s;
}

.canvas-widget:hover {
  box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.12);
}

.canvas-widget-body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: var(--radius-md, 12px);
}

.canvas-widget-body > :deep(.widget-wrapper) {
  height: 100%;
}

/* 拖拽手柄 */
.canvas-drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 20px;
  cursor: grab;
  z-index: 5;
  border-radius: var(--radius-md, 12px) var(--radius-md, 12px) 0 0;
  opacity: 0;
  transition: opacity 0.2s;
}

.canvas-drag-handle::after {
  content: '';
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  width: 24px;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.25);
}

.canvas-widget:hover .canvas-drag-handle {
  opacity: 1;
}

.canvas-drag-handle:active {
  cursor: grabbing;
}

/* 缩放手柄 */
.resize-handle {
  position: absolute;
  bottom: -3px;
  right: -3px;
  width: 20px;
  height: 20px;
  cursor: se-resize;
  z-index: 5;
  pointer-events: all;
  opacity: 0;
  transition: opacity 0.2s;
}

.resize-handle::after {
  content: '';
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 10px;
  height: 10px;
  border-right: 2px solid rgba(255, 255, 255, 0.3);
  border-bottom: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 0 0 3px 0;
}

.canvas-widget:hover .resize-handle,
.resize-handle:active {
  opacity: 1;
}

/* 尺寸标注 */
.resize-dimension {
  position: absolute;
  bottom: -24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 8px;
  font-size: 10px;
  font-family: var(--font-mono, monospace);
  font-weight: 600;
  color: var(--accent);
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(96, 165, 250, 0.3);
  border-radius: 6px;
  pointer-events: none;
  z-index: 6;
  white-space: nowrap;
}
</style>
