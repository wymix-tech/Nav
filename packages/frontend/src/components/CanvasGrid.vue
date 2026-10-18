<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import {
  CANVAS,
  worldToScreen,
  zoomAt,
  fitBounds,
  visibleBounds,
  contentBounds,
  validCamera,
  clamp,
  type Dashboard,
  type CanvasCamera,
  type CanvasLayout,
  type WidgetInstance,
  type Point,
  type Rect,
  type Size,
} from '@nav/shared'
import WidgetWrapper from './WidgetWrapper.vue'
import CanvasControls from './canvas/CanvasControls.vue'
import CanvasMinimap from './canvas/CanvasMinimap.vue'
import { useCanvasCamera } from '../canvas/useCanvasCamera'
import { useCanvasInteraction } from '../canvas/useCanvasInteraction'
import { createCanvasWidget, type AddWidgetRequest } from '../canvas/useCanvasInsertion'
import { widgetCanvas, resolveWidgetSize } from '../canvas/resolveWidgetSize'
const props = defineProps<{ dashboard: Dashboard; editing: boolean; editable: boolean }>()
const emit = defineEmits<{
  'update-canvas': [id: string, canvas: CanvasLayout]
  'set-default-camera': [camera: CanvasCamera]
  'add-widget': [widget: WidgetInstance]
  'remove-widget': [id: string]
  'update-config': [id: string, config: Record<string, any>]
  interaction: [active: boolean]
}>()
const root = ref<HTMLElement | null>(null),
  size = ref<Size>({ width: 0, height: 0 })
const hand = ref(false),
  minimap = ref(false),
  notice = ref(''),
  highlight = ref('')
const rects = computed(() => props.dashboard.widgets.map(widgetCanvas))
const { camera, presentation, ready, error } = useCanvasCamera(
  () => props.dashboard,
  size,
  () => contentBounds(rects.value),
)
const list = computed(() => presentation.value === 'list'),
  canEdit = computed(() => props.editing && props.editable)
const interaction = useCanvasInteraction({
  root,
  camera,
  size,
  hand,
  enabled: () => ready.value && !list.value,
  canEdit: () => canEdit.value,
  widgets: () => props.dashboard.widgets,
  commit: (id, c) => emit('update-canvas', id, c),
  interaction: (active) => emit('interaction', active),
})
const { draft, space } = interaction
function canvas(w: WidgetInstance) {
  return draft.value?.id === w.id ? draft.value.canvas : widgetCanvas(w)
}
const ordered = computed(() =>
  [...props.dashboard.widgets].sort(
    (a, b) =>
      widgetCanvas(a).y - widgetCanvas(b).y ||
      widgetCanvas(a).x - widgetCanvas(b).x ||
      a.id.localeCompare(b.id),
  ),
)
function style(w: WidgetInstance) {
  const c = canvas(w)
  return list.value
    ? {
        height: `${Math.max(resolveWidgetSize(w.widgetId, w.source).minHeight, Math.min(c.h, 600))}px`,
        order: ordered.value.findIndex((v) => v.id === w.id),
      }
    : { left: `${c.x}px`, top: `${c.y}px`, width: `${c.w}px`, height: `${c.h}px` }
}
const transform = computed(
  () =>
    `translate(${size.value.width / 2 - camera.value.centerX * camera.value.zoom}px,${size.value.height / 2 - camera.value.centerY * camera.value.zoom}px) scale(${camera.value.zoom})`,
)
const dots = computed(() => {
  const gap = CANVAS.snap * 2 ** Math.ceil(Math.log2(24 / (CANVAS.snap * camera.value.zoom)))
  const spacing = gap * camera.value.zoom,
    origin = worldToScreen({ x: 0, y: 0 }, camera.value, size.value)
  return {
    backgroundSize: `${spacing}px ${spacing}px`,
    backgroundPosition: `${(origin.x - spacing / 2) % spacing}px ${(origin.y - spacing / 2) % spacing}px`,
  }
})
// Canvas chrome occupies a dedicated dock below this measured viewport; library occupies its own slot.
function area(): Rect {
  return { x: 0, y: 0, w: size.value.width, h: size.value.height }
}
function fit(bounds = contentBounds(rects.value)) {
  settleNavigation()
  const result = fitBounds(bounds, size.value, area())
  if (result) {
    camera.value = result.camera
    notice.value = result.limited ? '已达到最小缩放，可通过小地图定位' : ''
  }
}
function settleNavigation() {
  interaction.endWheel()
  interaction.cancel()
}
function publishDefault() {
  settleNavigation()
  emit('set-default-camera', { ...camera.value })
}
function zoom(value: number) {
  if (!ready.value || size.value.width <= 0 || size.value.height <= 0) return
  settleNavigation()
  const a = area()
  camera.value = zoomAt(camera.value, { x: a.x + a.w / 2, y: a.y + a.h / 2 }, size.value, value)
}
function toggleHand() {
  const next = !hand.value
  settleNavigation()
  hand.value = next
}
function home() {
  settleNavigation()
  if (validCamera(props.dashboard.canvasSettings?.defaultCamera))
    camera.value = { ...props.dashboard.canvasSettings!.defaultCamera }
}
function navigate(p: Point) {
  settleNavigation()
  camera.value = {
    ...camera.value,
    centerX: clamp(p.x, -CANVAS.cameraLimit, CANVAS.cameraLimit),
    centerY: clamp(p.y, -CANVAS.cameraLimit, CANVAS.cameraLimit),
  }
}
function keyboard(e: KeyboardEvent, w: WidgetInstance) {
  if (
    !canEdit.value ||
    list.value ||
    !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
  )
    return
  e.preventDefault()
  e.stopPropagation()
  const c = { ...widgetCanvas(w) },
    min = resolveWidgetSize(w.widgetId, w.source),
    dx = e.key === 'ArrowLeft' ? -20 : e.key === 'ArrowRight' ? 20 : 0,
    dy = e.key === 'ArrowUp' ? -20 : e.key === 'ArrowDown' ? 20 : 0
  if (e.shiftKey) {
    c.w = clamp(c.w + dx, min.minWidth, CANVAS.maxSize)
    c.h = clamp(c.h + dy, min.minHeight, CANVAS.maxSize)
  } else {
    c.x = clamp(c.x + dx, -CANVAS.positionLimit, CANVAS.positionLimit)
    c.y = clamp(c.y + dy, -CANVAS.positionLimit, CANVAS.positionLimit)
  }
  emit('update-canvas', w.id, c)
}
async function addWidget(request: AddWidgetRequest) {
  if (!canEdit.value || !ready.value || !size.value.width || !size.value.height || !root.value)
    return
  if (request.client) {
    const r = root.value.getBoundingClientRect(),
      p = request.client
    if (p.x < r.left || p.x > r.right || p.y < r.top || p.y > r.bottom) return
  }
  const w = createCanvasWidget(
    request,
    camera.value,
    size.value,
    root.value.getBoundingClientRect(),
    area(),
    rects.value,
    props.dashboard.baseColumns ?? props.dashboard.columns,
  )
  emit('add-widget', w)
  highlight.value = w.id
  const c = w.canvas!
  if (
    c.w * camera.value.zoom > size.value.width - 64 ||
    c.h * camera.value.zoom > size.value.height - 64
  )
    fit(c)
  await nextTick()
  root.value
    .querySelector<HTMLElement>(`[data-widget-id="${w.id}"]`)
    ?.focus({ preventScroll: !list.value })
}
defineExpose({ addWidget })
let observer: ResizeObserver | undefined,
  frame = 0
watch(canEdit, () => interaction.cancel())
watch(
  () => props.dashboard.widgets.map((w) => w.id).join(','),
  () => interaction.cancel(),
)
watch([() => props.dashboard.id, () => props.dashboard.instanceId], () => interaction.cancel())
watch(presentation, () => {
  interaction.cancel()
  hand.value = false
})
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    const next = { width: entry.contentRect.width, height: entry.contentRect.height }
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      if (next.width !== size.value.width || next.height !== size.value.height) {
        interaction.cancel()
        size.value = next
      }
    })
  })
  if (root.value) {
    observer.observe(root.value)
    root.value.addEventListener('wheel', interaction.wheel, { passive: false })
  }
})
onUnmounted(() => {
  observer?.disconnect()
  cancelAnimationFrame(frame)
  root.value?.removeEventListener('wheel', interaction.wheel)
})
</script>
<template>
  <div class="canvas-stage">
    <section
      ref="root"
      class="canvas-grid"
      :class="{ stacked: list, 'hand-active': hand || space }"
      :style="list ? {} : dots"
      tabindex="0"
      aria-label="无限画布"
      @pointerdown="interaction.start($event)"
      @pointermove="interaction.move"
      @pointerup="interaction.finish"
      @pointercancel="interaction.cancel"
      @lostpointercapture="interaction.lost"
    >
      <div v-if="!list" class="canvas-background" aria-hidden="true"></div>
      <div
        class="canvas-content"
        :style="{ ...(list ? {} : { transform }), visibility: ready ? 'visible' : 'hidden' }"
      >
        <div
          v-for="w in dashboard.widgets"
          :key="w.id"
          v-memo="[
            w,
            editing,
            editable,
            list,
            canEdit,
            highlight === w.id,
            draft?.id === w.id ? draft.canvas : null,
            list ? ordered : null,
          ]"
          class="canvas-item"
          :class="{ highlight: highlight === w.id }"
          :data-widget-id="w.id"
          :style="style(w)"
          tabindex="-1"
        >
          <button
            v-if="canEdit && !list"
            class="canvas-drag-handle"
            :aria-label="`移动 ${w.widgetId}`"
            @pointerdown="interaction.start($event, 'move', w)"
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
            v-if="canEdit && !list"
            class="canvas-resize-handle"
            :aria-label="`调整 ${w.widgetId} 大小`"
            @pointerdown="interaction.start($event, 'resize', w)"
            @keydown="keyboard($event, w)"
          >
            ↘
          </button>
        </div>
      </div>
      <div v-if="(hand || space) && !list" class="canvas-gesture-layer" aria-hidden="true"></div>
      <CanvasMinimap
        v-if="minimap && !list && size.width > 0 && size.height > 0"
        class="canvas-ui map"
        :rects="rects"
        :viewport="visibleBounds(camera, size)"
        @navigate="navigate"
      />
    </section>
    <div class="canvas-ui dock">
      <p v-if="error || notice" role="status">{{ error || notice }}</p>
      <CanvasControls
        :style="{ visibility: ready ? 'visible' : 'hidden' }"
        :zoom="camera.zoom"
        :hand="hand"
        :list="list"
        :editable="canEdit"
        :minimap="minimap"
        @zoom="zoom(camera.zoom * $event)"
        @hundred="zoom(1)"
        @fit="fit()"
        @home="home"
        @publish="publishDefault"
        @hand="toggleHand"
        @list="presentation = list ? 'spatial' : 'list'"
        @minimap="minimap = !minimap"
      />
    </div>
  </div>
</template>
<style scoped>
.canvas-stage {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.canvas-grid {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  touch-action: auto;
  background-image: radial-gradient(circle, #94a3b84d 1px, transparent 1px);
  outline-offset: -2px;
}
.canvas-background {
  position: absolute;
  inset: 0;
  touch-action: none;
}
.canvas-content {
  position: absolute;
  inset: 0;
  transform-origin: 0 0;
  pointer-events: none;
}
.canvas-item {
  position: absolute;
  container-type: inline-size;
  pointer-events: auto;
  touch-action: auto;
}
.canvas-item.highlight {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
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
.canvas-gesture-layer {
  position: absolute;
  inset: 0;
  z-index: 20;
  touch-action: none;
  cursor: grab;
}
.hand-active {
  cursor: grab;
}
.map {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 30;
}
.dock {
  flex: none;
  padding: 6px 12px 84px;
}
.dock p {
  font-size: 12px;
  padding: 4px;
}
.stacked {
  overflow: auto;
  touch-action: auto;
  background: none;
}
.stacked .canvas-content {
  position: static;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}
.stacked .canvas-item {
  position: relative;
  min-width: 0;
  flex: none;
}
@media (max-width: 600px) {
  .dock {
    padding: 4px 6px 88px;
  }
}
</style>
