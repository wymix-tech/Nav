<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { WidgetInstance, WidgetLayout, CanvasLayout } from '@nav/shared'
import WidgetWrapper from './WidgetWrapper.vue'
import { useWidgetStore } from '../stores/widgetStore'
import CanvasGrid from './CanvasGrid.vue'
import { useScreenOrientation } from '../composables/useScreenOrientation'

const widgetStore = useWidgetStore()

const props = defineProps<{
  widgets: WidgetInstance[]
  editing: boolean
  editable: boolean
  columns?: number
  rowHeight?: number
  layoutMode?: 'grid' | 'canvas'
}>()

const emit = defineEmits<{
  'update-layout': [instanceId: string, layouts: WidgetInstance['layouts']]
  'update-canvas': [instanceId: string, canvas: CanvasLayout]
  'remove-widget': [instanceId: string]
  'update-config': [instanceId: string, config: Record<string, any>]
}>()

const ROW_HEIGHT = computed(() => props.rowHeight ?? 80)
const MARGIN = 10

// 屏幕方向检测（共享 composable）
const { isLandscape } = useScreenOrientation()

// 窗口宽度（用于网格列数自适应）
const windowWidth = ref(window.innerWidth)

function updateWindowWidth() {
  windowWidth.value = window.innerWidth
}

onMounted(() => {
  updateWindowWidth()
  window.addEventListener('resize', updateWindowWidth)
})
onUnmounted(() => {
  window.removeEventListener('resize', updateWindowWidth)
})

// 根据屏幕宽度确定默认网格列数（仅在用户未自定义时生效）
const defaultGridCols = computed(() => {
  const w = windowWidth.value
  if (w >= 1200) return 12
  if (w >= 992) return 10
  if (w >= 768) return 8
  return 6
})

// 用户自定义列数优先，未设置时按屏幕宽度自动适配
const activeCols = computed(() => props.columns ?? defaultGridCols.value)

// 列数变化时自适应组件尺寸
let prevCols = activeCols.value
watch(activeCols, (newCols) => {
  adaptAllWidgets(prevCols, newCols)
  prevCols = newCols
})

// 竖屏 → 堆叠；横屏 → CSS Grid
const isStackMode = computed(() => !isLandscape.value)

// 获取组件在当前网格列数下的布局坐标
function getScaledLayout(w: WidgetInstance): WidgetLayout {
  return w.layouts.lg
}

// 各内置组件的最佳尺寸（宽×高，以 12 列为基准）
const widgetOptimalSize: Record<string, { w: number; h: number; minW: number }> = {
  search:   { w: 8,  h: 2, minW: 4 },
  clock:    { w: 4,  h: 3, minW: 2 },
  weather:  { w: 4,  h: 3, minW: 3 },
  bookmark: { w: 4,  h: 3, minW: 2 },
  monitor:  { w: 4,  h: 3, minW: 3 },
  docker:   { w: 4,  h: 4, minW: 3 },
}

// 列数变化时自适应组件尺寸
function adaptAllWidgets(oldCols: number, newCols: number) {
  if (oldCols === newCols) return
  const scale = newCols / oldCols

  for (const w of props.widgets) {
    const l = w.layouts.lg

    // 获取最佳尺寸：内置组件用 widgetOptimalSize，第三方用 manifest.size
    let opt: { w: number; h: number; minW: number } | null = null
    if (widgetOptimalSize[w.widgetId]) {
      opt = widgetOptimalSize[w.widgetId]
    } else if (w.source === 'installed') {
      const manifest = widgetStore.getWidget(w.widgetId)?.manifest
      if (manifest?.size) {
        opt = {
          w: manifest.size.w,
          h: manifest.size.h,
          minW: manifest.minSize?.w ?? 2,
        }
      }
    }
    if (!opt) continue

    // 按比例缩放当前尺寸
    let newW = Math.max(opt.minW, Math.round(l.w * scale))
    newW = Math.min(newW, newCols)

    // 按最佳比例计算行数（向下取整更贴近最佳比例）
    const ratio = opt.h / opt.w
    let newH = Math.max(2, Math.floor(newW * ratio))

    // 超出网格时缩小
    while (newW * newH > newCols * 4 && newH > 2) newH--
    while (newW > newCols) newW--
    if (newW < opt.minW) newW = opt.minW

    if (newW !== l.w || newH !== l.h) {
      emit('update-layout', w.id, {
        ...w.layouts,
        lg: { x: l.x, y: l.y, w: newW, h: newH },
      })
    }
  }
}

const gridRows = computed(() => {
  let maxY = 0
  for (const w of props.widgets) {
    const l = getScaledLayout(w)
    if (l.y + l.h > maxY) maxY = l.y + l.h
  }
  // 至少撑满视口（减去顶部约 80px 留给 TopBar）
  const minRows = Math.ceil((window.innerHeight - 80) / (ROW_HEIGHT.value + MARGIN))
  return Math.max(1, maxY, minRows)
})

const gridStyle = computed(() => {
  if (isStackMode.value) {
    return {
      display: 'flex' as const,
      flexDirection: 'column' as const,
      gap: `${MARGIN}px`,
      width: '100%',
    }
  }
  return {
    display: 'grid' as const,
    gridTemplateColumns: `repeat(${activeCols.value}, 1fr)`,
    gridTemplateRows: `repeat(${gridRows.value}, ${ROW_HEIGHT.value}px)`,
    gap: `${MARGIN}px`,
    width: '100%',
  }
})

function widgetStyle(w: WidgetInstance) {
  if (isStackMode.value) {
    const h = w.layouts.lg?.h ?? 3
    return { width: '100%', minHeight: `${ROW_HEIGHT.value * h}px` }
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
  grabOffsetX: number
  grabOffsetY: number
  currentX: number
  currentY: number
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
  // 拖拽期间禁用过渡动画，保证即时跟随
  document.querySelector('.css-grid-layout')?.classList.remove('grid-transition')
  const l = getScaledLayout(w)
  const gridEl = document.querySelector('.css-grid-layout')
  if (!gridEl) return
  // 从手柄向上找到 .css-grid-item 父元素
  const gridItem = (e.currentTarget as HTMLElement).closest('.css-grid-item') as HTMLElement
  if (!gridItem) return
  const rect = gridItem.getBoundingClientRect()
  dragState.value = {
    widgetId: w.id,
    startMouseX: e.clientX,
    startMouseY: e.clientY,
    startGridX: l.x,
    startGridY: l.y,
    grabOffsetX: e.clientX - rect.left,
    grabOffsetY: e.clientY - rect.top,
    currentX: e.clientX,
    currentY: e.clientY,
  }
  // 将整个组件切换为 fixed 定位，跟随鼠标
  gridItem.style.position = 'fixed'
  gridItem.style.left = `${e.clientX - dragState.value.grabOffsetX}px`
  gridItem.style.top = `${e.clientY - dragState.value.grabOffsetY}px`
  gridItem.style.width = `${rect.width}px`
  gridItem.style.height = `${rect.height}px`
  gridItem.style.zIndex = '100'
  gridItem.style.pointerEvents = 'none'
  document.addEventListener('pointermove', onDragMove)
  document.addEventListener('pointerup', onDragEnd)
}

function onDragMove(e: PointerEvent) {
  if (!dragState.value) return
  const { widgetId, startMouseX, startMouseY, startGridX, startGridY, grabOffsetX, grabOffsetY } = dragState.value
  const colWidth = getGridColWidth()
  const rowHeight = ROW_HEIGHT.value + MARGIN
  const dx = e.clientX - startMouseX
  const dy = e.clientY - startMouseY
  const cols = activeCols.value
  const newCol = Math.max(0, Math.min(cols - 1, startGridX + Math.round(dx / (colWidth + MARGIN))))
  const newRow = Math.max(0, startGridY + Math.round(dy / rowHeight))

  // 更新跟随鼠标的 fixed 定位
  const el = document.querySelector(`[data-widget-id="${widgetId}"]`) as HTMLElement | null
  if (el) {
    el.style.left = `${e.clientX - grabOffsetX}px`
    el.style.top = `${e.clientY - grabOffsetY}px`
  }
  dragState.value.currentX = e.clientX
  dragState.value.currentY = e.clientY

  const w = props.widgets.find((w) => w.id === widgetId)
  if (!w) return
  const l = getScaledLayout(w)
  if (l.x === newCol && l.y === newRow) return

  emit('update-layout', widgetId, {
    ...w.layouts,
    lg: {
      x: newCol,
      y: newRow,
      w: l.w,
      h: l.h,
    },
  })
  compactLayout(widgetId)
}

function onDragEnd() {
  if (dragState.value) {
    const el = document.querySelector(`.css-grid-item[data-widget-id="${dragState.value.widgetId}"]`) as HTMLElement | null
    if (el) {
      el.style.position = ''
      el.style.left = ''
      el.style.top = ''
      el.style.width = ''
      el.style.height = ''
      el.style.zIndex = ''
      el.style.pointerEvents = ''
    }
  }
  dragState.value = null
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragEnd)
  // 启用过渡动画，让其他组件平滑移动到新位置
  nextTick(() => {
    const grid = document.querySelector('.css-grid-layout')
    grid?.classList.add('grid-transition')
    setTimeout(() => grid?.classList.remove('grid-transition'), 350)
  })
}

// --- 拖拽可视化：目标高亮 ---
const dragTargetHighlight = computed(() => {
  if (!dragState.value || isStackMode.value) return null
  const w = props.widgets.find((w) => w.id === dragState.value!.widgetId)
  if (!w) return null
  const l = getScaledLayout(w)
  if (l.x === dragState.value.startGridX && l.y === dragState.value.startGridY) return null
  const colWidth = getGridColWidth()
  const gapX = MARGIN * (l.x + 1)
  const gapY = MARGIN * (l.y + 1)
  return {
    left: `${colWidth * l.x + gapX}px`,
    top: `${ROW_HEIGHT.value * l.y + gapY}px`,
    width: `${colWidth * l.w + MARGIN * (l.w - 1)}px`,
    height: `${ROW_HEIGHT.value * l.h + MARGIN * (l.h - 1)}px`,
  }
})

// --- 碰撞检测：拖拽/缩放后自动 compact 避让 ---
function compactLayout(changedId?: string) {
  const cols = activeCols.value
  const scaled = props.widgets.map((w) => ({
    id: w.id,
    ...getScaledLayout(w),
    isChanged: w.id === changedId,
  }))

  // 按 y 排序，同 y 按 x 排序
  scaled.sort((a, b) => a.y - b.y || a.x - b.x)

  const placed: typeof scaled = []
  for (const item of scaled) {
    let newY = item.y
    // 找到不与任何已放置组件重叠的最低 y
    let collision = true
    while (collision) {
      collision = false
      for (const p of placed) {
        if (
          item.x < p.x + p.w &&
          item.x + item.w > p.x &&
          newY < p.y + p.h &&
          newY + item.h > p.y
        ) {
          newY = p.y + p.h
          collision = true
        }
      }
    }
    if (newY !== item.y) {
      item.y = newY
    }
    placed.push(item)
  }

  // 将变更 emit
  for (const item of placed) {
    if (item.isChanged) continue
    const w = props.widgets.find((w) => w.id === item.id)
    if (!w) continue
    const origScaled = getScaledLayout(w)
    if (origScaled.x === item.x && origScaled.y === item.y) continue
    emit('update-layout', item.id, {
      ...w.layouts,
      lg: {
        x: item.x,
        y: item.y,
        w: origScaled.w,
        h: item.h,
      },
    })
  }
}

// --- 缩放尺寸标注 ---
const resizeDimensionLabel = computed(() => {
  if (!resizeState.value) return null
  const w = props.widgets.find((w) => w.id === resizeState.value!.widgetId)
  if (!w) return null
  const l = getScaledLayout(w)
  return `${l.w}×${l.h}`
})

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
  document.querySelector('.css-grid-layout')?.classList.remove('grid-transition')
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
  const rowHeight = ROW_HEIGHT.value + MARGIN
  const dx = e.clientX - startMouseX
  const dy = e.clientY - startMouseY
  const cols = activeCols.value
  const newW = Math.max(2, Math.min(cols, startW + Math.round(dx / (colWidth + MARGIN))))
  const newH = Math.max(2, startH + Math.round(dy / rowHeight))

  const w = props.widgets.find((w) => w.id === widgetId)
  if (!w) return
  const l = getScaledLayout(w)
  if (l.w === newW && l.h === newH) return

  emit('update-layout', widgetId, {
    ...w.layouts,
    lg: {
      x: l.x,
      y: l.y,
      w: newW,
      h: newH,
    },
  })
  compactLayout(widgetId)
}

function onResizeEnd() {
  resizeState.value = null
  document.removeEventListener('pointermove', onResizeMove)
  document.removeEventListener('pointerup', onResizeEnd)
}
</script>

<template>
  <div class="dashboard-grid">
    <CanvasGrid
      v-if="layoutMode === 'canvas' && !isStackMode"
      :widgets="widgets"
      :editing="editing"
      :editable="editable"
      @update-layout="(id, c) => emit('update-canvas', id, c)"
      @remove-widget="(id) => emit('remove-widget', id)"
      @update-config="(id, cfg) => emit('update-config', id, cfg)"
    />
    <div
      v-else
      class="css-grid-layout"
      :class="{ 'stack-mode': isStackMode }"
      :style="gridStyle"
    >
      <div
        v-for="widget in widgets"
        :key="widget.id"
        class="css-grid-item"
        :data-widget-id="widget.id"
        :style="widgetStyle(widget)"
        :class="{
          dragging: dragState?.widgetId === widget.id,
          'stack-item': isStackMode
        }"
      >
        <div class="css-grid-inner">
          <!-- 拖拽手柄（仅编辑模式，普通流元素随组件移动） -->
          <div
            v-if="editing && !isStackMode"
            class="drag-handle"
            @pointerdown="!dragState ? onDragStart($event, widget) : undefined"
          />
          <div class="css-grid-body">
            <WidgetWrapper
              :widget="widget"
              :editing="editing"
              :editable="editable"
              @remove="emit('remove-widget', widget.id)"
              @update-config="(config) => emit('update-config', widget.id, config)"
            />
          </div>
        </div>
        <div
          v-if="editing && !isStackMode"
          class="resize-handle"
          @pointerdown="onResizeStart($event, widget)"
        />
        <div
          v-if="resizeState?.widgetId === widget.id && resizeDimensionLabel"
          class="resize-dimension"
        >{{ resizeDimensionLabel }}</div>
      </div>

      <!-- 拖拽可视化：网格定位点阵列 -->
      <div
        v-if="dragState && !isStackMode"
        class="grid-dots-overlay"
        :style="{
          gridTemplateColumns: `repeat(${activeCols}, 1fr)`,
          gridTemplateRows: `repeat(${gridRows}, ${ROW_HEIGHT}px)`,
          gap: `${MARGIN}px`,
        }"
      >
        <div v-for="i in activeCols * gridRows" :key="i" class="grid-dot-cell">
          <span class="grid-dot" />
        </div>
      </div>

      <!-- 拖拽可视化：目标位置高亮 -->
      <div
        v-if="dragState && dragTargetHighlight && !isStackMode"
        class="drag-target-highlight"
        :style="dragTargetHighlight"
      />
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
  border-radius: var(--radius-md, 12px);
}

/* 启用过渡时，组件平滑移动到新网格位置 */
.grid-transition .css-grid-item {
  transition: grid-column 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              grid-row 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.css-grid-item.stack-item {
  overflow: visible;
  min-height: auto;
}

.css-grid-item.dragging {
  opacity: 0.8;
  z-index: 10;
}

/* 内部布局 */
.css-grid-inner {
  position: relative;
  height: 100%;
}

.css-grid-body {
  height: 100%;
  overflow: hidden;
  border-radius: var(--radius-md, 12px);
}

.css-grid-body > :deep(.widget-wrapper) {
  height: 100%;
}

/* 拖拽手柄：绝对定位覆盖在内容上方，不占空间 */
.drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 20px;
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 5;
  border-radius: var(--radius-md, 12px) var(--radius-md, 12px) 0 0;
}

.drag-handle::after {
  content: '';
  width: 24px;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.25);
}

.drag-handle:hover {
  cursor: grabbing;
}

.css-grid-item:hover .drag-handle,
.css-grid-item.dragging .drag-handle {
  opacity: 1;
}

/* 网格定位点阵列 */
.grid-dots-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  pointer-events: none;
  z-index: 1;
}

.grid-dot-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}

.grid-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(96, 165, 250, 0.35);
  transition: background 0.2s;
}

/* 目标位置高亮边框 */
.drag-target-highlight {
  position: absolute;
  border: 2px dashed var(--accent);
  border-radius: var(--radius-md, 16px);
  background: rgba(96, 165, 250, 0.08);
  pointer-events: none;
  z-index: 3;
  animation: pulseHighlight 1.2s ease-in-out infinite;
}

@keyframes pulseHighlight {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
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

/* 缩放尺寸标注 */
.resize-dimension {
  position: absolute;
  bottom: 6px;
  right: 6px;
  padding: 2px 6px;
  font-size: 10px;
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--accent);
  background: rgba(15, 23, 42, 0.8);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(96, 165, 250, 0.3);
  border-radius: 6px;
  pointer-events: none;
  z-index: 6;
  white-space: nowrap;
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
