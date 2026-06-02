# Infinite Canvas Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the current grid layout with an infinite canvas mode where widgets can be placed at arbitrary pixel positions, with pan/zoom navigation and viewport persistence.

**Architecture:** Add a `canvas` layout mode alongside the existing `grid` mode. Widgets store pixel-based `{x, y, w, h}` positions in a `canvas` layout field. A `transform: translate(panX, panY) scale(zoom)` container handles pan/zoom. Viewport state (pan, zoom, home position) is stored in the Dashboard and persisted.

**Tech Stack:** Vue 3 Composition API, CSS transforms, pointer events, Pinia store

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/shared/src/types/dashboard.ts` | Modify | Add `CanvasLayout` type, `viewport` to Dashboard, `canvas` layout mode |
| `packages/frontend/src/stores/canvasStore.ts` | Create | Pan/zoom state, viewport persistence, coordinate transforms |
| `packages/frontend/src/components/CanvasGrid.vue` | Create | Infinite canvas rendering, pan/zoom, widget placement |
| `packages/frontend/src/components/CanvasControls.vue` | Create | Zoom slider, minimap toggle, fit-all, reset-view buttons |
| `packages/frontend/src/components/CanvasMinimap.vue` | Create | Bird's-eye view of all widgets with viewport indicator |
| `packages/frontend/src/components/DashboardGrid.vue` | Modify | Add mode switch between grid and canvas |
| `packages/frontend/src/components/TopBar.vue` | Modify | Add canvas mode toggle and canvas controls |
| `packages/frontend/src/components/WidgetLibrary.vue` | Modify | Support adding widgets in canvas mode (pixel coords) |
| `packages/frontend/src/App.vue` | Modify | Pass canvas props, handle canvas mode |
| `packages/frontend/src/stores/dashboardStore.ts` | Modify | Handle canvas layout updates, viewport save/load |

---

## Task 1: Extend Types for Canvas Mode

**Files:**
- Modify: `packages/shared/src/types/dashboard.ts`

- [ ] **Step 1: Add CanvasLayout type and viewport to Dashboard**

```typescript
// packages/shared/src/types/dashboard.ts

// 添加到 WidgetLayout 类型之后
export interface CanvasLayout {
  x: number   // 像素坐标（相对于画布原点）
  y: number
  w: number   // 像素宽度
  h: number   // 像素高度
}

// 修改 WidgetInstance.layouts
export interface WidgetInstance {
  id: string
  widgetId: string
  source: 'builtin' | 'installed'
  config: Record<string, any>
  layouts: {
    lg: WidgetLayout
    md: WidgetLayout
    sm: WidgetLayout
    xs: WidgetLayout
  }
  canvas?: CanvasLayout  // 画布模式下的位置（可选）
}

// 修改 Dashboard，添加 viewport 和 layoutMode
export interface DashboardViewport {
  panX: number
  panY: number
  zoom: number
  homeX: number   // "回到中心" 的目标位置
  homeY: number
}

export type LayoutMode = 'grid' | 'canvas'

export interface Dashboard {
  id: string
  name: string
  title: string
  widgets: WidgetInstance[]
  columns: number
  rowHeight: number
  background: DashboardBackground
  layoutMode: LayoutMode
  viewport: DashboardViewport
}
```

- [ ] **Step 2: Run type check**

```bash
cd packages/shared && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/dashboard.ts
git commit -m "feat(shared): 添加 CanvasLayout 类型和 Dashboard viewport/layoutMode"
```

---

## Task 2: Create Canvas Store

**Files:**
- Create: `packages/frontend/src/stores/canvasStore.ts`

- [ ] **Step 1: Create canvasStore with pan/zoom state and coordinate transforms**

```typescript
// packages/frontend/src/stores/canvasStore.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 3
const ZOOM_STEP = 0.1

export const useCanvasStore = defineStore('canvas', () => {
  // 画布状态
  const panX = ref(0)
  const panY = ref(0)
  const zoom = ref(1)
  const homeX = ref(0)
  const homeY = ref(0)

  // 画布元素引用（用于坐标转换）
  const canvasEl = ref<HTMLElement | null>(null)

  const clampedZoom = computed(() => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.value)))

  // 屏幕坐标 → 画布坐标
  function screenToCanvas(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - panX.value) / clampedZoom.value,
      y: (sy - panY.value) / clampedZoom.value,
    }
  }

  // 画布坐标 → 屏幕坐标
  function canvasToScreen(cx: number, cy: number): { x: number; y: number } {
    return {
      x: cx * clampedZoom.value + panX.value,
      y: cy * clampedZoom.value + panY.value,
    }
  }

  // 平移
  function pan(dx: number, dy: number) {
    panX.value += dx
    panY.value += dy
  }

  // 缩放（以某点为中心）
  function zoomAt(cx: number, cy: number, delta: number) {
    const oldZoom = clampedZoom.value
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom + delta))
    // 保持鼠标位置不变
    panX.value = cx - (cx - panX.value) * (newZoom / oldZoom)
    panY.value = cy - (cy - panY.value) * (newZoom / oldZoom)
    zoom.value = newZoom
  }

  // 缩放（以画布中心为基准）
  function zoomCenter(delta: number) {
    if (!canvasEl.value) return
    const rect = canvasEl.value.getBoundingClientRect()
    zoomAt(rect.width / 2, rect.height / 2, delta)
  }

  // 回到中心
  function resetView() {
    panX.value = homeX.value
    panY.value = homeY.value
    zoom.value = 1
  }

  // 设置当前位置为中心
  function setHomeAsCurrent() {
    homeX.value = panX.value
    homeY.value = panY.value
  }

  // 适应所有组件（缩放平移使所有组件可见）
  function fitAll(widgets: { x: number; y: number; w: number; h: number }[]) {
    if (!canvasEl.value || widgets.length === 0) return
    const rect = canvasEl.value.getBoundingClientRect()
    const padding = 80

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const w of widgets) {
      minX = Math.min(minX, w.x)
      minY = Math.min(minY, w.y)
      maxX = Math.max(maxX, w.x + w.w)
      maxY = Math.max(maxY, w.y + w.h)
    }

    const contentW = maxX - minX
    const contentH = maxY - minY
    const availW = rect.width - padding * 2
    const availH = rect.height - padding * 2

    const newZoom = Math.min(1, Math.min(availW / contentW, availH / contentH))
    zoom.value = Math.max(MIN_ZOOM, newZoom)

    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    panX.value = rect.width / 2 - centerX * zoom.value
    panY.value = rect.height / 2 - centerY * zoom.value
  }

  // 从 Dashboard viewport 恢复状态
  function restoreFromViewport(vp: { panX: number; panY: number; zoom: number; homeX: number; homeY: number }) {
    panX.value = vp.panX
    panY.value = vp.panY
    zoom.value = vp.zoom
    homeX.value = vp.homeX
    homeY.value = vp.homeY
  }

  // 导出当前 viewport 状态
  function getViewport() {
    return {
      panX: panX.value,
      panY: panY.value,
      zoom: clampedZoom.value,
      homeX: homeX.value,
      homeY: homeY.value,
    }
  }

  return {
    panX, panY, zoom, homeX, homeY,
    clampedZoom, canvasEl,
    screenToCanvas, canvasToScreen,
    pan, zoomAt, zoomCenter,
    resetView, setHomeAsCurrent, fitAll,
    restoreFromViewport, getViewport,
  }
})
```

- [ ] **Step 2: Run type check**

```bash
cd packages/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/stores/canvasStore.ts
git commit -m "feat: 新增 canvasStore — 画布平移/缩放状态管理与坐标转换"
```

---

## Task 3: Create CanvasGrid Component — Core Rendering

**Files:**
- Create: `packages/frontend/src/components/CanvasGrid.vue`

- [ ] **Step 1: Create the CanvasGrid component with transform container, widget rendering, and pan/zoom**

This is the core component. It renders a container with `transform: translate(panX, panY) scale(zoom)`, positions widgets absolutely inside it, and handles pan (space+drag / middle-click) and zoom (ctrl+scroll / pinch).

```vue
<!-- packages/frontend/src/components/CanvasGrid.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { WidgetInstance, CanvasLayout } from '@nav/shared'
import { useCanvasStore } from '../stores/canvasStore'
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
const containerEl = ref<HTMLElement | null>(null)

// 画布容器尺寸
const containerWidth = ref(window.innerWidth)
const containerHeight = ref(window.innerHeight)

onMounted(() => {
  canvasStore.canvasEl = containerEl.value
  const ro = new ResizeObserver(([entry]) => {
    containerWidth.value = entry.contentRect.width
    containerHeight.value = entry.contentRect.height
  })
  if (containerEl.value) ro.observe(containerEl.value)
  onUnmounted(() => ro.disconnect())
})

// ====== 平移 ======
const isPanning = ref(false)
const spaceHeld = ref(false)
let panStartX = 0
let panStartY = 0
let panStartPanX = 0
let panStartPanY = 0

function onPointerDown(e: PointerEvent) {
  // 空格+拖拽 或 中键拖拽 → 平移
  if (spaceHeld.value || e.button === 1) {
    e.preventDefault()
    isPanning.value = true
    panStartX = e.clientX
    panStartY = e.clientY
    panStartPanX = canvasStore.panX
    panStartPanY = canvasStore.panY
    document.addEventListener('pointermove', onPanMove)
    document.addEventListener('pointerup', onPanEnd)
    return
  }
}

function onPanMove(e: PointerEvent) {
  if (!isPanning.value) return
  canvasStore.panX = panStartPanX + (e.clientX - panStartX)
  canvasStore.panY = panStartPanY + (e.clientY - panStartY)
}

function onPanEnd() {
  isPanning.value = false
  document.removeEventListener('pointermove', onPanMove)
  document.removeEventListener('pointerup', onPanEnd)
}

// ====== 缩放 ======
function onWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    const rect = containerEl.value?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const delta = -e.deltaY * 0.002
    canvasStore.zoomAt(mx, my, delta)
  }
}

// ====== 键盘事件 ======
function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault()
    spaceHeld.value = true
  }
}
function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') spaceHeld.value = false
}

onMounted(() => {
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('keyup', onKeyUp)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('keyup', onKeyUp)
})

// ====== Widget 位置计算 ======
function widgetStyle(w: WidgetInstance) {
  const c = w.canvas
  if (!c) return { display: 'none' }
  return {
    position: 'absolute' as const,
    left: `${c.x}px`,
    top: `${c.y}px`,
    width: `${c.w}px`,
    height: `${c.h}px`,
  }
}

// ====== 拖拽 Widget ======
const dragState = ref<{
  widgetId: string
  startMouseX: number
  startMouseY: number
  startPosX: number
  startPosY: number
  grabOffsetX: number
  grabOffsetY: number
} | null>(null)

function onWidgetDragStart(e: PointerEvent, w: WidgetInstance) {
  if (!props.editing || !w.canvas || spaceHeld.value) return
  e.preventDefault()
  e.stopPropagation()
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  dragState.value = {
    widgetId: w.id,
    startMouseX: e.clientX,
    startMouseY: e.clientY,
    startPosX: w.canvas.x,
    startPosY: w.canvas.y,
    grabOffsetX: e.clientX - rect.left,
    grabOffsetY: e.clientY - rect.top,
  }
  document.addEventListener('pointermove', onWidgetDragMove)
  document.addEventListener('pointerup', onWidgetDragEnd)
}

function onWidgetDragMove(e: PointerEvent) {
  if (!dragState.value) return
  const { widgetId, startMouseX, startMouseY, startPosX, startPosY, grabOffsetX, grabOffsetY } = dragState.value
  const dx = (e.clientX - startMouseX) / canvasStore.clampedZoom
  const dy = (e.clientY - startMouseY) / canvasStore.clampedZoom
  const w = props.widgets.find((w) => w.id === widgetId)
  if (!w?.canvas) return

  const newX = Math.round(startPosX + dx)
  const newY = Math.round(startPosY + dy)

  emit('update-layout', widgetId, {
    ...w.canvas,
    x: newX,
    y: newY,
  })
}

function onWidgetDragEnd() {
  dragState.value = null
  document.removeEventListener('pointermove', onWidgetDragMove)
  document.removeEventListener('pointerup', onWidgetDragEnd)
}

// ====== 缩放 Widget ======
const resizeState = ref<{
  widgetId: string
  startMouseX: number
  startMouseY: number
  startW: number
  startH: number
} | null>(null)

function onResizeStart(e: PointerEvent, w: WidgetInstance) {
  if (!props.editing || !w.canvas || spaceHeld.value) return
  e.preventDefault()
  e.stopPropagation()
  resizeState.value = {
    widgetId: w.id,
    startMouseX: e.clientX,
    startMouseY: e.clientY,
    startW: w.canvas.w,
    startH: w.canvas.h,
  }
  document.addEventListener('pointermove', onResizeMove)
  document.addEventListener('pointerup', onResizeEnd)
}

function onResizeMove(e: PointerEvent) {
  if (!resizeState.value) return
  const { widgetId, startMouseX, startMouseY, startW, startH } = resizeState.value
  const dx = (e.clientX - startMouseX) / canvasStore.clampedZoom
  const dy = (e.clientY - startMouseY) / canvasStore.clampedZoom
  const w = props.widgets.find((w) => w.id === widgetId)
  if (!w?.canvas) return

  emit('update-layout', widgetId, {
    ...w.canvas,
    w: Math.max(100, Math.round(startW + dx)),
    h: Math.max(60, Math.round(startH + dy)),
  })
}

function onResizeEnd() {
  resizeState.value = null
  document.removeEventListener('pointermove', onResizeMove)
  document.removeEventListener('pointerup', onResizeEnd)
}

// ====== 双击回到中心 ======
function onDoubleClick() {
  canvasStore.resetView()
}
</script>

<template>
  <div
    class="canvas-container"
    :class="{ panning: isPanning || spaceHeld }"
    @pointerdown="onPointerDown"
    @wheel="onWheel"
    @dblclick="onDoubleClick"
  >
    <!-- 网格点背景 -->
    <div class="canvas-grid-bg" :style="{
      backgroundSize: `${20 * canvasStore.clampedZoom}px ${20 * canvasStore.clampedZoom}px`,
      backgroundPosition: `${canvasStore.panX}px ${canvasStore.panY}px`,
    }" />

    <!-- 画布内容（transform） -->
    <div
      ref="containerEl"
      class="canvas-content"
      :style="{
        transform: `translate(${canvasStore.panX}px, ${canvasStore.panY}px) scale(${canvasStore.clampedZoom})`,
        transformOrigin: '0 0',
      }"
    >
      <div
        v-for="widget in widgets"
        :key="widget.id"
        class="canvas-widget"
        :style="widgetStyle(widget)"
        @pointerdown="onWidgetDragStart($event, widget)"
      >
        <WidgetWrapper
          :widget="widget"
          :editing="editing"
          :editable="editable"
          @remove="emit('remove-widget', widget.id)"
          @update-config="(cfg) => emit('update-config', widget.id, cfg)"
        />
        <!-- 缩放手柄 -->
        <div
          v-if="editing && editable"
          class="resize-handle"
          @pointerdown="onResizeStart($event, widget)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.canvas-container {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  position: relative;
  cursor: grab;
}

.canvas-container.panning {
  cursor: grabbing;
}

.canvas-grid-bg {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px);
  pointer-events: none;
  z-index: 0;
}

.canvas-content {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
}

.canvas-widget {
  position: absolute;
  border-radius: var(--radius-md, 16px);
  overflow: hidden;
  cursor: default;
}

.canvas-widget:hover {
  outline: 1px solid rgba(96, 165, 250, 0.3);
  outline-offset: 2px;
}

.resize-handle {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 20px;
  height: 20px;
  cursor: se-resize;
  z-index: 5;
  border-bottom: 3px solid rgba(255, 255, 255, 0.15);
  border-right: 3px solid rgba(255, 255, 255, 0.15);
  border-radius: 0 0 var(--radius-md, 12px) 0;
  pointer-events: all;
  opacity: 0;
  transition: opacity 0.2s;
}

.canvas-widget:hover .resize-handle {
  opacity: 1;
}
</style>
```

- [ ] **Step 2: Run type check**

```bash
cd packages/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/components/CanvasGrid.vue
git commit -m "feat: 新增 CanvasGrid 组件 — 画布渲染/平移/缩放/拖拽/缩放"
```

---

## Task 4: Create Canvas Controls

**Files:**
- Create: `packages/frontend/src/components/CanvasControls.vue`

- [ ] **Step 1: Create zoom controls, fit-all, reset-view, set-home buttons**

```vue
<!-- packages/frontend/src/components/CanvasControls.vue -->
<script setup lang="ts">
import { useCanvasStore } from '../stores/canvasStore'
import type { WidgetInstance, CanvasLayout } from '@nav/shared'

const props = defineProps<{
  widgets: WidgetInstance[]
}>()

const canvas = useCanvasStore()

function zoomIn() { canvas.zoomCenter(0.1) }
function zoomOut() { canvas.zoomCenter(-0.1) }

function fitAll() {
  const rects = props.widgets
    .filter((w) => w.canvas)
    .map((w) => ({
      x: w.canvas!.x,
      y: w.canvas!.y,
      w: w.canvas!.w,
      h: w.canvas!.h,
    }))
  canvas.fitAll(rects)
}

function setHome() {
  canvas.setHomeAsCurrent()
}
</script>

<template>
  <div class="canvas-controls">
    <button class="ctrl-btn" @click="zoomIn" title="放大">+</button>
    <span class="zoom-label">{{ Math.round(canvas.clampedZoom * 100) }}%</span>
    <button class="ctrl-btn" @click="zoomOut" title="缩小">−</button>
    <div class="ctrl-divider" />
    <button class="ctrl-btn" @click="fitAll" title="适应全部">⊞</button>
    <button class="ctrl-btn" @click="canvas.resetView()" title="回到中心">⊙</button>
    <button class="ctrl-btn" @click="setHome" title="设为默认中心">⌂</button>
  </div>
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
  background: var(--glass-bg);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  padding: 6px 10px;
  box-shadow: var(--shadow-lg);
}

.ctrl-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.ctrl-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.ctrl-btn:active {
  transform: scale(0.92);
}

.zoom-label {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
  min-width: 36px;
  text-align: center;
  user-select: none;
}

.ctrl-divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 4px;
}

@media (max-width: 768px) {
  .canvas-controls {
    bottom: 80px;
    right: 16px;
  }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/components/CanvasControls.vue
git commit -m "feat: 新增 CanvasControls — 缩放控件/适应全部/回到中心/设为默认"
```

---

## Task 4b: Create CanvasMinimap — 全景预览小地图

**Files:**
- Create: `packages/frontend/src/components/CanvasMinimap.vue`

- [ ] **Step 1: Create minimap with viewport indicator, click-to-navigate, and zoom controls**

小地图固定在右上角，显示所有组件的缩略位置，蓝色半透明矩形表示当前视口范围。点击小地图任意位置可快速跳转，拖拽视口框可平移。包含放大/缩小按钮。

```vue
<!-- packages/frontend/src/components/CanvasMinimap.vue -->
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
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
const MINIMAP_W = 200
const MINIMAP_H = 140
const PADDING = 20

// 所有组件的 canvas 布局
const canvasWidgets = computed(() =>
  props.widgets.filter((w) => w.canvas).map((w) => w.canvas!)
)

// 计算所有组件的包围盒
const bounds = computed(() => {
  if (canvasWidgets.value.length === 0) {
    return { minX: -200, minY: -200, maxX: 200, maxY: 200 }
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const c of canvasWidgets.value) {
    minX = Math.min(minX, c.x)
    minY = Math.min(minY, c.y)
    maxX = Math.max(maxX, c.x + c.w)
    maxY = Math.max(maxY, c.y + c.h)
  }
  // 扩展边界，留出余量
  const pad = 100
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
})

// 缩放比例：将画布坐标映射到小地图像素
const minimapScale = computed(() => {
  const bw = bounds.value.maxX - bounds.value.minX
  const bh = bounds.value.maxY - bounds.value.minY
  if (bw <= 0 || bh <= 0) return 0.1
  return Math.min((MINIMAP_W - PADDING * 2) / bw, (MINIMAP_H - PADDING * 2) / bh)
})

// 组件在小地图中的位置
function widgetMiniStyle(c: CanvasLayout) {
  return {
    left: `${(c.x - bounds.value.minX) * minimapScale.value + PADDING}px`,
    top: `${(c.y - bounds.value.minY) * minimapScale.value + PADDING}px`,
    width: `${c.w * minimapScale.value}px`,
    height: `${c.h * minimapScale.value}px`,
  }
}

// 当前视口在小地图中的位置
const viewportRect = computed(() => {
  const vw = window.innerWidth / canvas.clampedZoom
  const vh = window.innerHeight / canvas.clampedZoom
  const vx = -canvas.panX / canvas.clampedZoom
  const vy = -canvas.panY / canvas.clampedZoom
  return {
    left: `${(vx - bounds.value.minX) * minimapScale.value + PADDING}px`,
    top: `${(vy - bounds.value.minY) * minimapScale.value + PADDING}px`,
    width: `${vw * minimapScale.value}px`,
    height: `${vh * minimapScale.value}px`,
  }
})

// ====== 点击/拖拽小地图导航 ======
const isDragging = ref(false)

function onMinimapPointerDown(e: PointerEvent) {
  isDragging.value = true
  navigateToMinimap(e)
  document.addEventListener('pointermove', onMinimapPointerMove)
  document.addEventListener('pointerup', onMinimapPointerUp)
}

function onMinimapPointerMove(e: PointerEvent) {
  if (!isDragging.value) return
  navigateToMinimap(e)
}

function onMinimapPointerUp() {
  isDragging.value = false
  document.removeEventListener('pointermove', onMinimapPointerMove)
  document.removeEventListener('pointerup', onMinimapPointerUp)
}

function navigateToMinimap(e: PointerEvent) {
  if (!minimapEl.value) return
  const rect = minimapEl.value.getBoundingClientRect()
  const mx = e.clientX - rect.left - PADDING
  const my = e.clientY - rect.top - PADDING
  // 小地图坐标 → 画布坐标
  const cx = mx / minimapScale.value + bounds.value.minX
  const cy = my / minimapScale.value + bounds.value.minY
  // 将该点移到视口中心
  canvas.panX = -(cx * canvas.clampedZoom - window.innerWidth / 2)
  canvas.panY = -(cy * canvas.clampedZoom - window.innerHeight / 2)
}
</script>

<template>
  <Transition name="minimap">
    <div v-if="visible" class="minimap" ref="minimapEl"
      @pointerdown="onMinimapPointerDown"
    >
      <div class="minimap-header">
        <span class="minimap-title">全景</span>
        <button class="minimap-close" @click.stop="emit('update:visible', false)">✕</button>
      </div>
      <div class="minimap-body">
        <!-- 组件缩略 -->
        <div
          v-for="(c, i) in canvasWidgets"
          :key="i"
          class="mini-widget"
          :style="widgetMiniStyle(c)"
        />
        <!-- 视口指示器 -->
        <div class="mini-viewport" :style="viewportRect" />
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
  width: 200px;
  background: rgba(15, 23, 42, 0.8);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  cursor: crosshair;
}

.minimap-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px 4px;
}

.minimap-title {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
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
}

.minimap-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.minimap-body {
  position: relative;
  width: 200px;
  height: 140px;
}

.mini-widget {
  position: absolute;
  background: rgba(96, 165, 250, 0.25);
  border: 1px solid rgba(96, 165, 250, 0.4);
  border-radius: 3px;
}

.mini-viewport {
  position: absolute;
  border: 2px solid var(--accent);
  background: rgba(96, 165, 250, 0.08);
  border-radius: 2px;
  pointer-events: none;
  transition: all 0.15s ease;
}

/* 动画 */
.minimap-enter-active,
.minimap-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.minimap-enter-from,
.minimap-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}
</style>
```

- [ ] **Step 2: 在 CanvasControls 中添加小地图开关按钮**

修改 `CanvasControls.vue`，添加小地图 toggle 按钮：

```vue
<!-- CanvasControls.vue script setup 中 -->
const showMinimap = ref(false)
```

```vue
<!-- CanvasControls.vue template 中，ctrl-divider 后添加 -->
<button class="ctrl-btn" :class="{ active: showMinimap }" @click="showMinimap = !showMinimap" title="全景预览">◫</button>
```

```vue
<!-- CanvasControls.vue template 末尾，控件之后添加 -->
<CanvasMinimap
  :widgets="widgets"
  :visible="showMinimap"
  @update:visible="showMinimap = $event"
/>
```

```vue
<!-- CanvasControls.vue script setup 中添加 import -->
import CanvasMinimap from './CanvasMinimap.vue'
```

- [ ] **Step 3: Run type check**

```bash
cd packages/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/CanvasMinimap.vue packages/frontend/src/components/CanvasControls.vue
git commit -m "feat: 新增 CanvasMinimap — 全景预览小地图，点击/拖拽快速定位"
```

---

## Task 5: Integrate Canvas Mode into DashboardGrid

**Files:**
- Modify: `packages/frontend/src/components/DashboardGrid.vue`
- Modify: `packages/frontend/src/components/TopBar.vue`
- Modify: `packages/frontend/src/App.vue`
- Modify: `packages/frontend/src/stores/dashboardStore.ts`
- Modify: `packages/frontend/src/components/WidgetLibrary.vue`

- [ ] **Step 1: Update DashboardGrid to support both grid and canvas modes**

在 `DashboardGrid.vue` 中添加 mode 切换逻辑：当 `layoutMode === 'canvas'` 时渲染 `CanvasGrid`，否则渲染原有网格。添加新的 props 和 emit。

```vue
<!-- DashboardGrid.vue 模板修改 -->
<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { WidgetInstance, WidgetLayout, CanvasLayout } from '@nav/shared'
import WidgetWrapper from './WidgetWrapper.vue'
import { useWidgetStore } from '../stores/widgetStore'
import CanvasGrid from './CanvasGrid.vue'

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
</script>

<template>
  <div class="dashboard-grid">
    <!-- 画布模式 -->
    <CanvasGrid
      v-if="layoutMode === 'canvas'"
      :widgets="widgets"
      :editing="editing"
      :editable="editable"
      @update-layout="(id, c) => emit('update-canvas', id, c)"
      @remove-widget="(id) => emit('remove-widget', id)"
      @update-config="(id, cfg) => emit('update-config', id, cfg)"
    />
    <!-- 网格模式 -->
    <div v-else class="css-grid-layout" ...>
      <!-- 原有网格逻辑不变 -->
    </div>
  </div>
</template>
```

- [ ] **Step 2: 更新 TopBar 添加模式切换按钮**

在 TopBar 的编辑模式按钮组中添加网格/画布切换：

```vue
<!-- TopBar.vue template 中，编辑按钮之后添加 -->
<button class="panel-btn mode-btn" @click="emit('toggle-layout-mode')">
  {{ layoutMode === 'canvas' ? '⊞' : '◫' }}
</button>
```

添加 prop 和 emit：

```typescript
defineProps<{
  editing: boolean
  backendAvailable: boolean
  libraryVisible?: boolean
  layoutMode?: 'grid' | 'canvas'
}>()

const emit = defineEmits<{
  'toggle-edit': []
  'login': []
  'show-preferences': []
  'toggle-library': []
  'clear-all': []
  'show-about': []
  'toggle-layout-mode': []
}>()
```

- [ ] **Step 3: 更新 App.vue 集成画布模式**

```vue
<!-- App.vue -->
<ConfirmDialog
  v-if="showClearConfirm"
  ...
/>

<!-- 画布模式时显示 CanvasControls -->
<CanvasControls
  v-if="dashboardStore.dashboard?.layoutMode === 'canvas'"
  :widgets="dashboardStore.dashboard?.widgets ?? []"
/>

<TopBar
  ...
  :layout-mode="dashboardStore.dashboard?.layoutMode"
  @toggle-layout-mode="toggleLayoutMode"
/>

<DashboardGrid
  ...
  :layout-mode="dashboardStore.dashboard?.layoutMode"
  @update-canvas="(id, c) => dashboardStore.updateWidgetCanvas(id, c)"
/>
```

添加函数：

```typescript
function toggleLayoutMode() {
  if (!dashboardStore.dashboard) return
  const newMode = dashboardStore.dashboard.layoutMode === 'canvas' ? 'grid' : 'canvas'
  dashboardStore.dashboard.layoutMode = newMode
  dashboardStore.save()
}
```

- [ ] **Step 4: 更新 dashboardStore 添加 updateWidgetCanvas**

```typescript
// dashboardStore.ts
function updateWidgetCanvas(instanceId: string, canvas: CanvasLayout) {
  if (!dashboard.value) return
  const widget = dashboard.value.widgets.find((w) => w.id === instanceId)
  if (widget) {
    widget.canvas = canvas
    save()
    fetch(`/api/widgets/${instanceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ canvas }),
    }).catch(() => {})
  }
}
```

- [ ] **Step 5: 更新 WidgetLibrary 支持画布模式添加组件**

在 `addToDashboard` 中根据当前 layoutMode 决定初始位置：

```typescript
function addToDashboard(widgetId: string, source: 'builtin' | 'installed') {
  const layoutMode = dashboardStore.dashboard?.layoutMode ?? 'grid'
  // ... 原有 grid 模式逻辑不变 ...

  if (layoutMode === 'canvas') {
    // 画布模式：在当前视口中心放置
    instance.canvas = {
      x: Math.round(-panX / zoom + containerWidth / zoom / 2),
      y: Math.round(-panY / zoom + containerHeight / zoom / 2),
      w: 320,
      h: 240,
    }
  }

  dashboardStore.addWidget(instance)
}
```

- [ ] **Step 6: Run type check**

```bash
cd packages/frontend && npx vue-tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/components/DashboardGrid.vue \
        packages/frontend/src/components/TopBar.vue \
        packages/frontend/src/App.vue \
        packages/frontend/src/stores/dashboardStore.ts \
        packages/frontend/src/components/WidgetLibrary.vue
git commit -m "feat: 集成画布模式 — DashboardGrid/TopBar/App/Store/WidgetLibrary 联动"
```

---

## Task 6: Handle Existing Data Migration

**Files:**
- Modify: `packages/frontend/src/stores/dashboardStore.ts`

- [ ] **Step 1: 在 load() 中处理旧数据兼容**

```typescript
// dashboardStore.ts - load() 函数中
async function load() {
  const adapter = await getStorageAdapter()
  const data = await adapter.getDashboard()
  // 兼容旧数据：缺失字段补默认值
  if (data && !data.layoutMode) data.layoutMode = 'grid'
  if (data && !data.viewport) {
    data.viewport = { panX: 0, panY: 0, zoom: 1, homeX: 0, homeY: 0 }
  }
  for (const w of data?.widgets ?? []) {
    if (!w.canvas) w.canvas = undefined
  }
  dashboard.value = data
  loading.value = false
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/stores/dashboardStore.ts
git commit -m "fix: dashboardStore load() 兼容旧数据，补全 layoutMode/viewport/canvas 默认值"
```

---

## Task 7: Viewport Persistence

**Files:**
- Modify: `packages/frontend/src/components/CanvasGrid.vue`
- Modify: `packages/frontend/src/stores/canvasStore.ts`

- [ ] **Step 1: 在 CanvasGrid 中监听 pan/zoom 变化，自动保存 viewport**

```vue
<!-- CanvasGrid.vue script setup 中 -->
import { watch, onMounted } from 'vue'
import { useDashboardStore } from '../stores/dashboardStore'

const dashboardStore = useDashboardStore()

// 初始化时从 dashboard viewport 恢复
onMounted(() => {
  const vp = dashboardStore.dashboard?.viewport
  if (vp) canvasStore.restoreFromViewport(vp)
})

// pan/zoom 变化时自动保存（防抖）
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/components/CanvasGrid.vue packages/frontend/src/stores/canvasStore.ts
git commit -m "feat: 画布 viewport 自动持久化（防抖 500ms）"
```

---

## Task 8: Background Adaptation for Canvas Mode

**Files:**
- Modify: `packages/frontend/src/App.vue`

- [ ] **Step 1: 画布模式下背景固定不跟随平移**

```vue
<!-- App.vue bgStyle computed 中 -->
const bgStyle = computed(() => {
  const bg = dashboardStore.dashboard?.background
  const isCanvas = dashboardStore.dashboard?.layoutMode === 'canvas'

  if (!bg || bg.mode === 'color') {
    return { backgroundImage: 'none', backgroundColor: bg?.color ?? '#0c1021' }
  }
  if (!bg.images || bg.images.length === 0) {
    return { backgroundImage: 'none', backgroundColor: bg?.color ?? '#0c1021' }
  }
  const img = bg.images[slideshowIndex.value % bg.images.length]
  return {
    backgroundImage: `url(${img.src})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    // 画布模式下背景固定，不随 pan 移动
    backgroundAttachment: isCanvas ? 'fixed' : 'scroll',
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/App.vue
git commit -m "fix: 画布模式下背景固定不跟随平移"
```

---

## Task 9: Mobile/Stack Mode — Hide Canvas Controls

**Files:**
- Modify: `packages/frontend/src/components/CanvasControls.vue`
- Modify: `packages/frontend/src/components/CanvasGrid.vue`

- [ ] **Step 1: 竖屏/移动端禁用画布模式，回退到网格**

```vue
<!-- CanvasGrid.vue script setup 中 -->
const isLandscape = ref(window.innerWidth > window.innerHeight)

function updateOrientation() {
  isLandscape.value = window.innerWidth > window.innerHeight
}

onMounted(() => {
  window.addEventListener('resize', updateOrientation)
  window.addEventListener('orientationchange', updateOrientation)
})
onUnmounted(() => {
  window.removeEventListener('resize', updateOrientation)
  window.removeEventListener('orientationchange', updateOrientation)
})
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/components/CanvasGrid.vue
git commit -m "fix: 竖屏模式下画布自动回退到网格布局"
```

---

## Task 10: Final Integration Test & Polish

- [ ] **Step 1: 启动开发环境，验证以下场景**

```bash
pnpm dev
```

测试清单：
- [ ] 网格模式正常工作（不回归）
- [ ] 切换到画布模式，空白画布显示网格点
- [ ] 空格+拖拽可以平移画布
- [ ] Ctrl+滚轮可以缩放
- [ ] 从组件库添加组件到画布中心
- [ ] 拖拽组件到任意位置
- [ ] 缩放组件大小
- [ ] "回到中心" 按钮回到默认位置
- [ ] "设为默认中心" 保存当前位置
- [ ] "适应全部" 缩放至所有组件可见
- [ ] 双击画布回到中心
- [ ] 刷新页面后恢复上次视口位置
- [ ] 编辑模式下组件工具栏正常显示
- [ ] 竖屏自动切换回网格模式

- [ ] **Step 2: 修复发现的问题**

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "feat: 无限画布模式 — 完整集成与测试"
```
