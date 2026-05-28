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

const ROW_HEIGHT = 80
const MARGIN = 10

// 屏幕方向检测：宽 > 高 = 横屏，否则竖屏
const isLandscape = ref(window.innerWidth > window.innerHeight)

function updateOrientation() {
  isLandscape.value = window.innerWidth > window.innerHeight
}

onMounted(() => {
  updateOrientation()
  window.addEventListener('resize', updateOrientation)
  window.addEventListener('orientationchange', updateOrientation)
})
onUnmounted(() => {
  window.removeEventListener('resize', updateOrientation)
  window.removeEventListener('orientationchange', updateOrientation)
})

const maxCols = computed(() => props.columns ?? 12)

// 根据屏幕宽度确定网格列数（横屏模式）
const gridCols = computed(() => {
  const w = window.innerWidth
  if (w >= 1200) return 12
  if (w >= 992) return 10
  if (w >= 768) return 8
  return 6
})

const activeCols = computed(() => Math.min(maxCols.value, gridCols.value))

// 竖屏 → 堆叠；横屏 → CSS Grid
const isStackMode = computed(() => !isLandscape.value)

// 从 lg 布局等比缩放到当前网格列数
function getScaledLayout(w: WidgetInstance): WidgetLayout {
  const layout = w.layouts.lg
  const scale = activeCols.value / 12
  return {
    x: Math.round(layout.x * scale),
    y: layout.y,
    w: Math.max(1, Math.round(layout.w * scale)),
    h: layout.h,
  }
}

const gridRows = computed(() => {
  let maxY = 0
  for (const w of props.widgets) {
    const l = getScaledLayout(w)
    if (l.y + l.h > maxY) maxY = l.y + l.h
  }
  return Math.max(1, maxY)
})

const gridStyle = computed(() => {
  if (isStackMode.value) {
    return {
      display: 'flex',
      flexDirection: 'column',
      gap: `${MARGIN}px`,
      width: '100%',
    }
  }
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${activeCols.value}, 1fr)`,
    gridTemplateRows: `repeat(${gridRows.value}, ${ROW_HEIGHT}px)`,
    gap: `${MARGIN}px`,
    width: '100%',
  }
})

function widgetStyle(w: WidgetInstance) {
  if (isStackMode.value) {
    return { width: '100%', minHeight: `${ROW_HEIGHT * 3}px` }
  }
  const l = getScaledLayout(w)
  return {
    gridColumn: `${l.x + 1} / span ${l.w}`,
    gridRow: `${l.y + 1} / span ${l.h}`,
  }
}

// --- 拖拽支持（网格模式下生效） ---
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
  const cols = activeCols.value
  return (gridEl.clientWidth - (cols + 1) * MARGIN) / cols
}

function onDragStart(e: PointerEvent, w: WidgetInstance) {
  if (!props.editing || isStackMode.value) return
  e.preventDefault()
  const l = getScaledLayout(w)
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
  const cols = activeCols.value
  const newCol = Math.max(0, Math.min(cols - 1, startGridX + Math.round(dx / (colWidth + MARGIN))))
  const newRow = Math.max(0, startGridY + Math.round(dy / rowHeight))

  const w = props.widgets.find((w) => w.id === widgetId)
  if (!w) return
  const l = getScaledLayout(w)
  if (l.x === newCol && l.y === newRow) return

  // 当前网格位置反算回 lg 的 12 列坐标
  const reverseScale = 12 / cols
  emit('update-layout', widgetId, {
    ...w.layouts,
    lg: {
      x: Math.round(newCol * reverseScale),
      y: newRow,
      w: Math.max(1, Math.round(l.w * reverseScale)),
      h: l.h,
    },
  })
}

function onDragEnd() {
  dragState.value = null
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragEnd)
}

// --- 调整大小支持（网格模式下生效） ---
const resizeState = ref<{
  widgetId: string
  startMouseX: number
  startMouseY: number
  startW: number
  startH: number
} | null>(null)

function onResizeStart(e: PointerEvent, w: WidgetInstance) {
  if (!props.editing || isStackMode.value) return
  e.preventDefault()
  e.stopPropagation()
  const l = getScaledLayout(w)
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
  const cols = activeCols.value
  const newW = Math.max(2, Math.min(cols, startW + Math.round(dx / (colWidth + MARGIN))))
  const newH = Math.max(2, startH + Math.round(dy / rowHeight))

  const w = props.widgets.find((w) => w.id === widgetId)
  if (!w) return
  const l = getScaledLayout(w)
  if (l.w === newW && l.h === newH) return

  const reverseScale = 12 / cols
  emit('update-layout', widgetId, {
    ...w.layouts,
    lg: {
      x: Math.round(l.x * reverseScale),
      y: l.y,
      w: Math.max(1, Math.round(newW * reverseScale)),
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
    <div
      class="css-grid-layout"
      :class="{ 'stack-mode': isStackMode }"
      :style="gridStyle"
    >
      <div
        v-for="widget in widgets"
        :key="widget.id"
        class="css-grid-item"
        :style="widgetStyle(widget)"
        :class="{ dragging: dragState?.widgetId === widget.id, 'stack-item': isStackMode }"
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
          v-if="editing && !isStackMode"
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
  overflow: hidden;
}

.css-grid-layout {
  position: relative;
  overflow: hidden;
}

.css-grid-layout.stack-mode {
  overflow: visible;
}

.css-grid-item {
  position: relative;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  border-radius: var(--radius-md, 12px);
}

.css-grid-item.stack-item {
  overflow: visible;
  min-height: auto;
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

@media (max-width: 480px) {
  .css-grid-item {
    border-radius: var(--radius-sm, 8px);
  }

  .css-grid-item > :deep(.widget-wrapper) {
    border-radius: var(--radius-sm, 8px);
  }
}
</style>
