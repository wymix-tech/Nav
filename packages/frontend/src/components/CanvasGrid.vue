<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import {
  constraints,
  type WidgetInstance,
  type CanvasLayout,
  type DashboardViewport,
} from '@nav/shared'
import WidgetWrapper from './WidgetWrapper.vue'
const props = defineProps<{
  widgets: WidgetInstance[]
  editing: boolean
  editable: boolean
  viewport?: DashboardViewport
  viewportWidth?: number
  viewportHeight?: number
}>()
const emit = defineEmits<{
  'update-canvas': [id: string, canvas: CanvasLayout]
  'update-viewport': [viewport: DashboardViewport]
  'remove-widget': [id: string]
  'update-config': [id: string, config: Record<string, any>]
  interaction: [active: boolean]
}>()
const root = ref<HTMLElement | null>(null)
const width = ref(1200),
  height = ref(800)
const view = ref<DashboardViewport>({ panX: 0, panY: 0, zoom: 1, homeX: 0, homeY: 0 })
const draft = ref<{ id: string; canvas: CanvasLayout } | null>(null)
const minimap = ref(false)
const canEdit = computed(() => props.editing && props.editable)
const stacked = computed(() => width.value < 768)
// Adapt the view only. Canonical widget coordinates and reference dimensions never change on resize.
const ratio = computed(() =>
  Math.max(
    0.01,
    Math.min(
      width.value / (props.viewportWidth ?? 1920),
      height.value / (props.viewportHeight ?? 1080),
    ),
  ),
)
const scale = computed(() => view.value.zoom * ratio.value)
const transform = computed(
  () =>
    `translate(${view.value.panX * ratio.value}px,${view.value.panY * ratio.value}px) scale(${scale.value})`,
)
function canvas(w: WidgetInstance): CanvasLayout {
  return draft.value?.id === w.id
    ? draft.value.canvas
    : (w.canvas ?? {
        x: w.layouts.lg.x * 120,
        y: w.layouts.lg.y * 90,
        w: w.layouts.lg.w * 120 - 10,
        h: w.layouts.lg.h * 90 - 10,
      })
}
function style(w: WidgetInstance) {
  const c = canvas(w)
  return stacked.value
    ? { minHeight: `${Math.max(constraints[w.widgetId]?.minHeight ?? 160, Math.min(c.h, 600))}px` }
    : { left: `${c.x}px`, top: `${c.y}px`, width: `${c.w}px`, height: `${c.h}px` }
}
let active: {
  pointer: number
  target: HTMLElement
  mode: 'pan' | 'move' | 'resize'
  id?: string
  x: number
  y: number
  view: DashboardViewport
  canvas?: CanvasLayout
  scale: number
  ratio: number
} | null = null
let observer: ResizeObserver | undefined,
  frame = 0,
  wheelTimer: ReturnType<typeof setTimeout> | undefined
let pendingSize: { width: number; height: number } | undefined
watch(
  () => props.viewport,
  (v) => {
    if (!active) view.value = { panX: 0, panY: 0, zoom: 1, homeX: 0, homeY: 0, ...v }
  },
  { immediate: true, deep: true },
)
watch(canEdit, () => cancel())
watch(
  () => props.widgets.map((w) => w.id).join(','),
  () => cancel(),
)
function applyPendingSize() {
  if (pendingSize) {
    width.value = pendingSize.width
    height.value = pendingSize.height
    pendingSize = undefined
  }
}
function saveView() {
  if (canEdit.value) emit('update-viewport', { ...view.value })
}
function flushWheel(save: boolean) {
  if (wheelTimer) {
    clearTimeout(wheelTimer)
    wheelTimer = undefined
    if (save) saveView()
  }
}
function cancel() {
  cancelAnimationFrame(frame)
  const state = active
  active = null
  if (state) {
    view.value = state.view
    if (state.target.hasPointerCapture(state.pointer))
      state.target.releasePointerCapture(state.pointer)
  }
  draft.value = null
  emit('interaction', false)
  applyPendingSize()
}
function start(e: PointerEvent, mode: 'pan' | 'move' | 'resize', w?: WidgetInstance) {
  if (stacked.value || (mode !== 'pan' && !canEdit.value) || ![0, 1].includes(e.button) || active)
    return
  if (
    mode === 'pan' &&
    e.target !== root.value &&
    !(e.target as Element).classList.contains('canvas-content')
  )
    return
  flushWheel(true)
  e.preventDefault()
  e.stopPropagation()
  const target = e.currentTarget as HTMLElement
  target.setPointerCapture(e.pointerId)
  active = {
    pointer: e.pointerId,
    target,
    mode,
    id: w?.id,
    x: e.clientX,
    y: e.clientY,
    view: { ...view.value },
    canvas: w ? { ...canvas(w) } : undefined,
    scale: scale.value,
    ratio: ratio.value,
  }
  emit('interaction', true)
}
function preview(e: PointerEvent) {
  const a = active
  if (!a || a.pointer !== e.pointerId) return
  const dx = e.clientX - a.x,
    dy = e.clientY - a.y
  if (a.mode === 'pan')
    view.value = { ...a.view, panX: a.view.panX + dx / a.ratio, panY: a.view.panY + dy / a.ratio }
  else {
    const c = a.canvas!,
      w = props.widgets.find((w) => w.id === a.id)!,
      min = constraints[w.widgetId]
    const snap = (n: number) => Math.round(n / 20) * 20
    const bound = (n: number) => Math.max(-1000000, Math.min(1000000, n))
    draft.value = {
      id: a.id!,
      canvas:
        a.mode === 'move'
          ? { ...c, x: bound(snap(c.x + dx / a.scale)), y: bound(snap(c.y + dy / a.scale)) }
          : {
              ...c,
              w: Math.min(16384, Math.max(min?.minWidth ?? 160, snap(c.w + dx / a.scale))),
              h: Math.min(16384, Math.max(min?.minHeight ?? 120, snap(c.h + dy / a.scale))),
            },
    }
  }
}
function move(e: PointerEvent) {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => preview(e))
}
function finish(e: PointerEvent) {
  if (!active || e.pointerId !== active.pointer) return
  cancelAnimationFrame(frame)
  preview(e)
  const a = active,
    result = draft.value,
    next = { ...view.value }
  active = null
  draft.value = null
  if (a.target.hasPointerCapture(a.pointer)) a.target.releasePointerCapture(a.pointer)
  if (a.mode === 'pan') {
    if (JSON.stringify(next) !== JSON.stringify(a.view)) saveView()
  } else if (result && JSON.stringify(result.canvas) !== JSON.stringify(a.canvas))
    emit('update-canvas', result.id, result.canvas)
  emit('interaction', false)
  applyPendingSize()
}
function escape(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    cancel()
    flushWheel(false)
  }
}
function zoomAt(x: number, y: number, zoom: number) {
  const old = view.value.zoom,
    z = Math.max(0.1, Math.min(3, zoom))
  view.value = {
    ...view.value,
    zoom: z,
    panX: x - ((x - view.value.panX) * z) / old,
    panY: y - ((y - view.value.panY) * z) / old,
  }
}
function zoom(delta: number) {
  flushWheel(false)
  zoomAt(width.value / ratio.value / 2, height.value / ratio.value / 2, view.value.zoom + delta)
  saveView()
}
function wheel(e: WheelEvent) {
  if (!(e.ctrlKey || e.metaKey) || stacked.value || active) return
  e.preventDefault()
  const r = root.value!.getBoundingClientRect()
  zoomAt(
    (e.clientX - r.left) / ratio.value,
    (e.clientY - r.top) / ratio.value,
    view.value.zoom - e.deltaY * 0.002,
  )
  if (wheelTimer) clearTimeout(wheelTimer)
  wheelTimer = setTimeout(() => {
    wheelTimer = undefined
    saveView()
  }, 250)
}
const bounds = computed(() => {
  const all = props.widgets.map(canvas)
  const x = Math.min(0, ...all.map((c) => c.x)),
    y = Math.min(0, ...all.map((c) => c.y))
  return {
    x,
    y,
    w: Math.max(1, ...all.map((c) => c.x + c.w)) - x,
    h: Math.max(1, ...all.map((c) => c.y + c.h)) - y,
  }
})
function fit() {
  const b = bounds.value
  const z = Math.max(
    0.1,
    Math.min(1, (width.value - 80) / ratio.value / b.w, (height.value - 80) / ratio.value / b.h),
  )
  view.value = {
    ...view.value,
    zoom: z,
    panX: width.value / ratio.value / 2 - (b.x + b.w / 2) * z,
    panY: height.value / ratio.value / 2 - (b.y + b.h / 2) * z,
  }
  saveView()
}
function home() {
  flushWheel(false)
  view.value = { ...view.value, panX: view.value.homeX, panY: view.value.homeY, zoom: 1 }
  saveView()
}
function setHome() {
  view.value = { ...view.value, homeX: view.value.panX, homeY: view.value.panY }
  saveView()
}
function navigateMap(e: MouseEvent) {
  const rect = e.currentTarget instanceof Element ? e.currentTarget.getBoundingClientRect() : null
  if (!rect) return
  const b = bounds.value
  view.value = {
    ...view.value,
    panX:
      width.value / ratio.value / 2 -
      (b.x + ((e.clientX - rect.left) / rect.width) * b.w) * view.value.zoom,
    panY:
      height.value / ratio.value / 2 -
      (b.y + ((e.clientY - rect.top) / rect.height) * b.h) * view.value.zoom,
  }
  saveView()
}
function keyboard(e: KeyboardEvent, w: WidgetInstance) {
  if (
    !canEdit.value ||
    stacked.value ||
    !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
  )
    return
  e.preventDefault()
  const c = { ...canvas(w) },
    dx = e.key === 'ArrowLeft' ? -20 : e.key === 'ArrowRight' ? 20 : 0,
    dy = e.key === 'ArrowUp' ? -20 : e.key === 'ArrowDown' ? 20 : 0
  if (e.shiftKey) {
    c.w = Math.max(constraints[w.widgetId]?.minWidth ?? 160, Math.min(16384, c.w + dx))
    c.h = Math.max(constraints[w.widgetId]?.minHeight ?? 120, Math.min(16384, c.h + dy))
  } else {
    c.x = Math.max(-1000000, Math.min(1000000, c.x + dx))
    c.y = Math.max(-1000000, Math.min(1000000, c.y + dy))
  }
  emit('update-canvas', w.id, c)
}
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    const size = { width: entry.contentRect.width, height: entry.contentRect.height }
    if (active) pendingSize = size
    else {
      width.value = size.width
      height.value = size.height
    }
  })
  if (root.value) observer.observe(root.value)
  window.addEventListener('keydown', escape)
})
onUnmounted(() => {
  observer?.disconnect()
  cancel()
  flushWheel(false)
  window.removeEventListener('keydown', escape)
})
</script>
<template>
  <section
    ref="root"
    class="canvas-grid"
    :class="{ stacked }"
    aria-label="无限画布"
    @pointerdown="start($event, 'pan')"
    @pointermove="move"
    @pointerup="finish"
    @pointercancel="cancel"
    @lostpointercapture="cancel"
    @wheel="wheel"
    @dblclick.self="home"
  >
    <div class="canvas-content" :style="stacked ? {} : { transform }">
      <div
        v-for="w in widgets"
        :key="w.id"
        class="canvas-item"
        :data-widget-id="w.id"
        :style="style(w)"
      >
        <button
          v-if="canEdit && !stacked"
          class="canvas-drag-handle"
          :aria-label="`移动 ${w.widgetId}`"
          @pointerdown="start($event, 'move', w)"
          @keydown="keyboard($event, w)"
        >
          ⠿
        </button>
        <WidgetWrapper
          :widget="w"
          :editing="editing"
          :editable="editable"
          @remove="emit('remove-widget', w.id)"
          @update-config="emit('update-config', w.id, $event)"
        />
        <button
          v-if="canEdit && !stacked"
          class="canvas-resize-handle"
          :aria-label="`调整 ${w.widgetId} 大小`"
          @pointerdown="start($event, 'resize', w)"
          @keydown="keyboard($event, w)"
        >
          ↘
        </button>
      </div>
    </div>
    <div v-if="!stacked" class="canvas-controls" aria-label="画布控制">
      <button aria-label="缩小画布" @click="zoom(-0.1)">−</button
      ><span>{{ Math.round(view.zoom * 100) }}%</span
      ><button aria-label="放大画布" @click="zoom(0.1)">+</button>
      <button @click="fit">适应全部</button><button @click="home">回到中心</button
      ><button v-if="canEdit" @click="setHome">设为默认</button
      ><button :aria-expanded="minimap" @click="minimap = !minimap">小地图</button>
      <svg
        v-if="minimap"
        class="canvas-minimap"
        :viewBox="`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`"
        preserveAspectRatio="none"
        role="img"
        aria-label="画布小地图，点击定位"
        @click="navigateMap"
      >
        <rect
          v-for="w in widgets"
          :key="w.id"
          :x="canvas(w).x"
          :y="canvas(w).y"
          :width="canvas(w).w"
          :height="canvas(w).h"
          fill="currentColor"
          opacity="0.4"
        />
        <rect
          :x="-view.panX / view.zoom"
          :y="-view.panY / view.zoom"
          :width="width / scale"
          :height="height / scale"
          fill="none"
          stroke="currentColor"
          stroke-width="5"
        />
      </svg>
    </div>
  </section>
</template>
<style scoped>
.canvas-grid {
  position: relative;
  height: calc(100dvh - 64px);
  min-height: 400px;
  overflow: hidden;
  touch-action: none;
  background-image: radial-gradient(circle, #94a3b84d 1px, transparent 1px);
  background-size: 24px 24px;
}
.canvas-content {
  position: absolute;
  inset: 0;
  transform-origin: 0 0;
}
.canvas-item {
  position: absolute;
  container-type: inline-size;
}
.canvas-drag-handle,
.canvas-resize-handle {
  position: absolute;
  z-index: 15;
  touch-action: none;
  background: var(--bg-secondary);
  border: 1px solid var(--glass-border);
  padding: 4px 10px;
}
.canvas-drag-handle {
  top: 0;
  left: 0;
  cursor: grab;
}
.canvas-resize-handle {
  bottom: 0;
  right: 0;
  cursor: nwse-resize;
}
.canvas-controls {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px;
  max-width: calc(100% - 24px);
  background: var(--glass-bg);
  backdrop-filter: blur(16px);
  border-radius: 12px;
}
.canvas-controls button {
  padding: 5px;
}
.canvas-minimap {
  width: 160px;
  height: 90px;
  border: 1px solid var(--glass-border);
  cursor: crosshair;
}
.stacked {
  height: auto;
  min-height: 0;
  overflow: visible;
  touch-action: auto;
  background: none;
}
.stacked .canvas-content {
  position: static;
  display: grid;
  gap: 12px;
}
.stacked .canvas-item {
  position: relative;
  min-width: 0;
}
</style>
