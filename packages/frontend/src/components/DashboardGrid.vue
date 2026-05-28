<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { WidgetInstance, WidgetLayout } from '@nav/shared'
import WidgetWrapper from './WidgetWrapper.vue'

const props = defineProps<{
  widgets: WidgetInstance[]
  editing: boolean
  editable: boolean
  columns?: number
}>()

const emit = defineEmits<{
  'update-layout': [instanceId: string, layouts: WidgetInstance['layouts']]
  'remove-widget': [instanceId: string]
  'update-config': [instanceId: string, config: Record<string, any>]
}>()

const breakpoints = { lg: 1200, md: 992, sm: 768, xs: 480, xxs: 0 }
const colNums = { lg: 12, md: 8, sm: 6, xs: 4, xxs: 2 }
const ROW_HEIGHT = 80
const MARGIN = 10

const currentBreakpoint = ref('lg')

function detectBreakpoint(width: number): string {
  const sorted = Object.entries(breakpoints).sort((a, b) => a[1] - b[1])
  let result = sorted[0][0]
  for (const [bp, min] of sorted) {
    if (width > min) result = bp
  }
  return result
}

function updateBreakpoint() {
  currentBreakpoint.value = detectBreakpoint(window.innerWidth)
}

onMounted(() => {
  updateBreakpoint()
  window.addEventListener('resize', updateBreakpoint)
})
onUnmounted(() => {
  window.removeEventListener('resize', updateBreakpoint)
})

const libCols = computed(() => props.columns ?? 12)

// 获取当前断点下每个组件的布局（使用 lg 布局，缩放到自定义列数）
function getWidgetLayout(w: WidgetInstance): WidgetLayout {
  const bp = currentBreakpoint.value
  const layout = w.layouts[bp] ?? w.layouts.lg
  const bpCols = colNums[bp] ?? 12
  const scale = libCols.value / bpCols
  return {
    x: Math.round(layout.x * scale),
    y: layout.y,
    w: Math.round(layout.w * scale),
    h: layout.h,
  }
}

// 计算网格总高度（行数）
const gridRows = computed(() => {
  let maxY = 0
  for (const w of props.widgets) {
    const l = getWidgetLayout(w)
    if (l.y + l.h > maxY) maxY = l.y + l.h
  }
  return maxY
})

// CSS Grid 样式
const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${libCols.value}, 1fr)`,
  gridTemplateRows: `repeat(${gridRows.value}, ${ROW_HEIGHT}px)`,
  gap: `${MARGIN}px`,
  width: '100%',
}))

// 每个组件的网格区域样式
function widgetStyle(w: WidgetInstance) {
  const l = getWidgetLayout(w)
  return {
    gridColumn: `${l.x + 1} / span ${l.w}`,
    gridRow: `${l.y + 1} / span ${l.h}`,
  }
}

// --- 拖拽支持 ---
const dragState = ref<{
  widgetId: string
  startMouseX: number
  startMouseY: number
  startGridX: number
  startGridY: number
} | null>(null)

function getGridColWidth(): number {
  const gridEl = document.querySelector('.css-grid-layout')
  if (!gridEl) return 100
  return (gridEl.clientWidth - (libCols.value + 1) * MARGIN) / libCols.value
}

function onDragStart(e: PointerEvent, w: WidgetInstance) {
  if (!props.editing) return
  e.preventDefault()
  const l = getWidgetLayout(w)
  dragState.value = {
    widgetId: w.id,
    startMouseX: e.clientX,
    startMouseY: e.clientY,
    startGridX: l.x,
    startGridY: l.y,
  }
  document.addEventListener('pointermove', onDragMove)
  document.addEventListener('pointerup', onDragEnd)
}

function onDragMove(e: PointerEvent) {
  if (!dragState.value) return
  const { widgetId, startMouseX, startMouseY, startGridX, startGridY } = dragState.value
  const colWidth = getGridColWidth()
  const rowHeight = ROW_HEIGHT + MARGIN
  const dx = e.clientX - startMouseX
  const dy = e.clientY - startMouseY
  const newCol = Math.max(0, Math.min(libCols.value - 1, startGridX + Math.round(dx / (colWidth + MARGIN))))
  const newRow = Math.max(0, startGridY + Math.round(dy / rowHeight))

  const w = props.widgets.find((w) => w.id === widgetId)
  if (!w) return
  const l = getWidgetLayout(w)
  if (l.x === newCol && l.y === newRow) return

  const bp = currentBreakpoint.value
  const bpCols = colNums[bp] ?? 12
  const reverseScale = bpCols / libCols.value
  emit('update-layout', widgetId, {
    ...w.layouts,
    [bp]: {
      x: Math.round(newCol * reverseScale),
      y: newRow,
      w: Math.round(l.w * reverseScale),
      h: l.h,
    },
  })
}

function onDragEnd() {
  dragState.value = null
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragEnd)
}

// --- 调整大小支持 ---
const resizeState = ref<{
  widgetId: string
  startMouseX: number
  startMouseY: number
  startW: number
  startH: number
} | null>(null)

function onResizeStart(e: PointerEvent, w: WidgetInstance) {
  if (!props.editing) return
  e.preventDefault()
  e.stopPropagation()
  const l = getWidgetLayout(w)
  resizeState.value = {
    widgetId: w.id,
    startMouseX: e.clientX,
    startMouseY: e.clientY,
    startW: l.w,
    startH: l.h,
  }
  document.addEventListener('pointermove', onResizeMove)
  document.addEventListener('pointerup', onResizeEnd)
}

function onResizeMove(e: PointerEvent) {
  if (!resizeState.value) return
  const { widgetId, startMouseX, startMouseY, startW, startH } = resizeState.value
  const colWidth = getGridColWidth()
  const rowHeight = ROW_HEIGHT + MARGIN
  const dx = e.clientX - startMouseX
  const dy = e.clientY - startMouseY
  const newW = Math.max(2, Math.min(libCols.value, startW + Math.round(dx / (colWidth + MARGIN))))
  const newH = Math.max(2, startH + Math.round(dy / rowHeight))

  const w = props.widgets.find((w) => w.id === widgetId)
  if (!w) return
  const l = getWidgetLayout(w)
  if (l.w === newW && l.h === newH) return

  const bp = currentBreakpoint.value
  const bpCols = colNums[bp] ?? 12
  const reverseScale = bpCols / libCols.value
  emit('update-layout', widgetId, {
    ...w.layouts,
    [bp]: {
      x: Math.round(l.x * reverseScale),
      y: l.y,
      w: Math.round(newW * reverseScale),
      h: newH,
    },
  })
}

function onResizeEnd() {
  resizeState.value = null
  document.removeEventListener('pointermove', onResizeMove)
  document.removeEventListener('pointerup', onResizeEnd)
}
</script>

<template>
  <div class="dashboard-grid">
    <div class="css-grid-layout" :style="gridStyle">
      <div
        v-for="widget in widgets"
        :key="widget.id"
        class="css-grid-item"
        :style="widgetStyle(widget)"
        :class="{ dragging: dragState?.widgetId === widget.id }"
        @pointerdown="onDragStart($event, widget)"
      >
        <WidgetWrapper
          :widget="widget"
          :editing="editing"
          :editable="editable"
          @remove="emit('remove-widget', widget.id)"
          @update-config="(config) => emit('update-config', widget.id, config)"
        />
        <div
          v-if="editing"
          class="resize-handle"
          @pointerdown="onResizeStart($event, widget)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-grid {
  width: 100%;
}

.css-grid-layout {
  position: relative;
}

.css-grid-item {
  position: relative;
  min-height: 0;
  border-radius: var(--radius-md, 12px);
}

.css-grid-item > :deep(.widget-wrapper) {
  overflow: hidden;
  border-radius: var(--radius-md, 12px);
  height: 100%;
}

.css-grid-item.dragging {
  opacity: 0.8;
  z-index: 10;
}

.resize-handle {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 22px;
  height: 22px;
  cursor: se-resize;
  z-index: 5;
  border-bottom: 3px solid rgba(255, 255, 255, 0.15);
  border-right: 3px solid rgba(255, 255, 255, 0.15);
  border-radius: 0 0 var(--radius-md, 12px) 0;
  pointer-events: all;
}
</style>
