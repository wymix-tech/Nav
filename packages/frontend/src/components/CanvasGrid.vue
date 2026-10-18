<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import {
  CANVAS,
  effectiveLocked,
  groupFor,
  normalizeSelection,
  sceneRanks,
  refKey,
  selectionRect,
  resolveCanvasLabel,
  type CanvasCommand,
  type SelectionRef,
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
import { useDashboardStore } from '../stores/dashboardStore'
import { useCanvasLabels } from '../canvas/useCanvasLabels'
import { useCanvasSelection } from '../canvas/useCanvasSelection'
import type { CanvasTool } from '../canvas/useCanvasInteraction'
import CanvasSelectionOverlay from './canvas/CanvasSelectionOverlay.vue'
import CanvasRegionLayer from './canvas/CanvasRegionLayer.vue'
import CanvasLayersPanel from './canvas/CanvasLayersPanel.vue'
import CanvasSearchPanel from './canvas/CanvasSearchPanel.vue'
import CanvasViewsPanel from './canvas/CanvasViewsPanel.vue'
import CanvasEditTools from './canvas/CanvasEditTools.vue'
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
}>()
const store = useDashboardStore()
const tool = ref<CanvasTool>('interact'),
  snapping = ref(true),
  panel = ref<'' | 'layers' | 'search' | 'views'>('')
const { selected, additive, choose } = useCanvasSelection(() => props.dashboard)
const ranks = computed(() => sceneRanks(props.dashboard))
const names = useCanvasLabels()
const root = ref<HTMLElement | null>(null),
  size = ref<Size>({ width: 0, height: 0 })
const hand = ref(false),
  minimap = ref(false),
  notice = ref(''),
  highlight = ref('')
const rects = computed(() => [
  ...props.dashboard.widgets.map(widgetCanvas),
  ...(props.dashboard.canvasScene?.regions ?? []),
])
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
  tool,
  selected,
  additive,
  snapping,
  dashboard: () => props.dashboard,
  commit: (command) => {
    void commandAction(command, false)
  },
  notice: (message) => {
    notice.value = message
  },
})
const { draft, space, marquee, regionDraft, guides } = interaction
function canvas(w: WidgetInstance) {
  return draft.value?.widgets[w.id] ?? widgetCanvas(w)
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
    : {
        left: `${c.x}px`,
        top: `${c.y}px`,
        width: `${c.w}px`,
        height: `${c.h}px`,
        zIndex: ranks.value[w.id] ?? 0,
      }
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
  if (effectiveLocked(props.dashboard, { kind: 'widget', id: w.id })) {
    notice.value = '组件布局已锁定'
    return
  }
  const c = { ...widgetCanvas(w) },
    min = resolveWidgetSize(w.widgetId, w.source),
    dx = e.key === 'ArrowLeft' ? -CANVAS.snap : e.key === 'ArrowRight' ? CANVAS.snap : 0,
    dy = e.key === 'ArrowUp' ? -CANVAS.snap : e.key === 'ArrowDown' ? CANVAS.snap : 0
  if (e.shiftKey) {
    c.w = clamp(c.w + dx, min.minWidth, CANVAS.maxSize)
    c.h = clamp(c.h + dy, min.minHeight, CANVAS.maxSize)
  } else {
    c.x = clamp(c.x + dx, -CANVAS.positionLimit, CANVAS.positionLimit)
    c.y = clamp(c.y + dy, -CANVAS.positionLimit, CANVAS.positionLimit)
  }
  if (!e.shiftKey) {
    void commandAction({
      type: 'move',
      refs: normalizeSelection(props.dashboard, [{ kind: 'widget', id: w.id }]),
      delta: { x: dx, y: dy },
    })
    return
  }
  if (groupFor(props.dashboard, w.id)) {
    notice.value = '请先解组再调整大小'
    return
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
  selected.value = [{ kind: 'widget', id: w.id }]
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
const selectedBoxes = computed(() =>
  normalizeSelection(props.dashboard, selected.value).map((r) => ({
    ref: r,
    rect:
      r.kind === 'widget' && draft.value?.widgets[r.id]
        ? draft.value.widgets[r.id]
        : r.kind === 'region' && draft.value?.regions[r.id]
          ? draft.value.regions[r.id]
          : r.kind === 'group' && draft.value
            ? contentBounds(
                props.dashboard
                  .canvasScene!.groups.find((g) => g.id === r.id)!
                  .memberIds.map(
                    (id) =>
                      draft.value?.widgets[id] ??
                      widgetCanvas(props.dashboard.widgets.find((w) => w.id === id)!),
                  ),
              )!
            : selectionRect(props.dashboard, r),
  })),
)
const renderedRegions = computed(() =>
  (props.dashboard.canvasScene?.regions ?? []).map((r) => draft.value?.regions[r.id] ?? r),
)
const isSelected = (id: string) =>
  normalizeSelection(props.dashboard, [{ kind: 'widget', id }]).some((r) =>
    selected.value.some((s) => refKey(s) === refKey(r)),
  )
const locked = (id: string) => effectiveLocked(props.dashboard, { kind: 'widget', id })
async function commandAction(command: CanvasCommand, cancel = true) {
  if (cancel) interaction.cancel()
  if (!canEdit.value) return
  const ok = await store.applyCanvasCommand(command)
  notice.value = ok ? '操作已完成' : store.error
  if (ok) selected.value = normalizeSelection(props.dashboard, selected.value)
}
function changeTool(value: CanvasTool) {
  settleNavigation()
  hand.value = false
  tool.value = value
}
function selectFromPanel(r: SelectionRef, extend: boolean) {
  interaction.cancel()
  if (canEdit.value) choose(r, extend || additive.value)
}
let previousCamera: CanvasCamera | null = null,
  highlightTimer: ReturnType<typeof setTimeout> | undefined,
  trigger: HTMLElement | null = null
function openPanel(value: typeof panel.value) {
  settleNavigation()
  trigger = document.activeElement as HTMLElement
  panel.value = panel.value === value ? '' : value
}
function closePanel() {
  panel.value = ''
  nextTick(() => trigger?.focus())
}
async function locate(r: SelectionRef) {
  const valid =
    r.kind === 'widget'
      ? props.dashboard.widgets.some((w) => w.id === r.id)
      : normalizeSelection(props.dashboard, [r]).length > 0
  if (!valid) {
    notice.value = '目标已不存在'
    return
  }
  settleNavigation()
  previousCamera ??= { ...camera.value }
  let ids: string[] = []
  if (r.kind === 'widget') ids = [r.id]
  if (r.kind === 'group')
    ids = props.dashboard.canvasScene!.groups.find((g) => g.id === r.id)!.memberIds
  if (list.value && r.kind !== 'region') {
    await nextTick()
    root.value
      ?.querySelector<HTMLElement>(`[data-widget-id="${ids[0]}"]`)
      ?.scrollIntoView({ block: 'center' })
  } else {
    if (list.value) presentation.value = 'spatial'
    await nextTick()
    fit(selectionRect(props.dashboard, r))
  }
  highlight.value = ids[0] ?? ''
  if (highlightTimer) clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => {
    highlight.value = ''
  }, 1500)
  notice.value = `已定位 ${resolveCanvasLabel(props.dashboard, r, names.value)}`
}
function back() {
  if (previousCamera) {
    settleNavigation()
    camera.value = previousCamera
    previousCamera = null
  }
}
function namedNavigate(value: CanvasCamera) {
  settleNavigation()
  presentation.value = 'spatial'
  camera.value = { ...value }
}
function shortcuts(e: KeyboardEvent) {
  const target = e.target as Element
  if (
    !root.value?.closest('.canvas-stage')?.contains(target) ||
    target.closest('input,textarea,select,[contenteditable],[role="dialog"],.widget-content')
  )
    return
  if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    openPanel('search')
    return
  }
  if (!canEdit.value) return
  if (e.key === 'Escape') {
    if (panel.value) closePanel()
    else selected.value = []
    return
  }
  if (tool.value !== 'select') return
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault()
    selected.value = [...(props.dashboard.canvasScene?.layers ?? [])]
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
    if (e.shiftKey && selected.value.length && selected.value.every((r) => r.kind === 'group')) {
      e.preventDefault()
      void commandAction({ type: 'ungroup', refs: selected.value })
    } else if (
      !e.shiftKey &&
      selected.value.length >= 2 &&
      selected.value.every((r) => r.kind === 'widget')
    ) {
      e.preventDefault()
      void commandAction({
        type: 'group',
        widgetIds: selected.value.map((r) => r.id),
        id: crypto.randomUUID(),
        title: '新分组',
      })
    }
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected.value.length) {
    e.preventDefault()
    void commandAction({ type: 'delete', refs: selected.value })
  }
}
defineExpose({ addWidget })
let observer: ResizeObserver | undefined,
  frame = 0
watch(canEdit, () => {
  interaction.cancel()
  if (!canEdit.value) {
    tool.value = 'interact'
    selected.value = []
  }
})
watch([() => props.dashboard.id, () => props.dashboard.instanceId], () => interaction.cancel())
watch(presentation, () => {
  interaction.cancel()
  hand.value = false
})
onMounted(() => {
  window.addEventListener('keydown', shortcuts)
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
  window.removeEventListener('keydown', shortcuts)
  if (highlightTimer) clearTimeout(highlightTimer)
  observer?.disconnect()
  cancelAnimationFrame(frame)
  root.value?.removeEventListener('wheel', interaction.wheel)
})
</script>
<template>
  <div class="canvas-stage">
    <div class="canvas-workspace">
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
        <CanvasRegionLayer
          v-if="!list"
          :regions="renderedRegions"
          :camera="camera"
          :size="size"
          :editable="canEdit"
          @start="interaction.start"
        />
        <div
          class="canvas-content"
          :style="{
            ...(list ? {} : { transform, '--canvas-inverse': 1 / camera.zoom }),
            visibility: ready ? 'visible' : 'hidden',
          }"
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
              draft?.widgets[w.id] ?? null,
              isSelected(w.id),
              locked(w.id),
              ranks[w.id],
              tool,
              list ? ordered : null,
            ]"
            class="canvas-item"
            :class="{ highlight: highlight === w.id, selected: isSelected(w.id) }"
            :data-widget-id="w.id"
            :style="style(w)"
            tabindex="-1"
          >
            <button
              v-if="canEdit && !list && !locked(w.id)"
              class="canvas-drag-handle"
              :aria-label="`移动 ${w.widgetId}`"
              @pointerdown="interaction.start($event, 'move', { kind: 'widget', id: w.id })"
              @keydown="keyboard($event, w)"
            >
              ⠿
            </button>
            <button
              v-if="canEdit && tool === 'select' && !list"
              class="widget-select-cover"
              :aria-label="`选择 ${resolveCanvasLabel(dashboard, { kind: 'widget', id: w.id }, names)}`"
              @pointerdown="interaction.start($event, 'move', { kind: 'widget', id: w.id })"
              @dblclick="changeTool('interact')"
            ></button>
            <button
              v-if="canEdit && list"
              class="list-select"
              @click="choose({ kind: 'widget', id: w.id }, $event.shiftKey || additive)"
            >
              选择 {{ resolveCanvasLabel(dashboard, { kind: 'widget', id: w.id }, names) }}
            </button>
            <WidgetWrapper
              :widget="w"
              :editing="editing"
              :editable="editable"
              :can-delete="!locked(w.id) && !groupFor(dashboard, w.id)"
              @remove="emit('remove-widget', w.id)"
              @update-config="emit('update-config', w.id, $event)"
            />
            <button
              v-if="canEdit && !list && !locked(w.id) && !groupFor(dashboard, w.id)"
              class="canvas-resize-handle"
              :aria-label="`调整 ${w.widgetId} 大小`"
              @pointerdown="interaction.start($event, 'resize', { kind: 'widget', id: w.id })"
              @keydown="keyboard($event, w)"
            >
              ↘
            </button>
          </div>
        </div>
        <div
          v-if="(hand || space || tool === 'region') && !list"
          class="canvas-gesture-layer"
          aria-hidden="true"
        ></div>
        <CanvasSelectionOverlay
          v-if="!list"
          :boxes="selectedBoxes"
          :camera="camera"
          :size="size"
          :marquee="marquee"
          :preview="regionDraft"
          :guides="guides"
        />
        <CanvasMinimap
          v-if="minimap && !list && size.width > 0 && size.height > 0"
          class="canvas-ui map"
          :rects="rects"
          :viewport="visibleBounds(camera, size)"
          @navigate="navigate"
        />
      </section>
      <aside
        v-if="panel"
        class="canvas-ui workspace-panel"
        :aria-label="{ layers: '图层面板', search: '搜索面板', views: '我的视角' }[panel]"
      >
        <button @click="closePanel">关闭面板</button>
        <CanvasLayersPanel
          v-if="panel === 'layers'"
          :dashboard="dashboard"
          :selected="selected"
          :editable="canEdit"
          :names="names"
          @select="selectFromPanel"
          @command="commandAction"
          @locate="locate"
        />
        <CanvasSearchPanel
          v-else-if="panel === 'search'"
          :dashboard="dashboard"
          :names="names"
          @locate="locate"
          @back="back"
          @close="closePanel"
        />
        <CanvasViewsPanel
          v-else
          :dashboard="dashboard"
          :camera="camera"
          @navigate="namedNavigate"
        />
      </aside>
    </div>
    <div class="canvas-ui dock">
      <div class="panel-buttons">
        <button @click="openPanel('layers')">图层</button
        ><button @click="openPanel('search')">搜索画布</button
        ><button @click="openPanel('views')">我的视角</button
        ><button v-if="tool !== 'interact' && canEdit" @click="changeTool('interact')">
          进入组件
        </button>
      </div>
      <CanvasEditTools
        v-if="canEdit"
        :dashboard="dashboard"
        :selected="selected"
        :tool="tool"
        :additive="additive"
        :snapping="snapping"
        :list="list"
        @tool="changeTool"
        @additive="additive = !additive"
        @snapping="snapping = !snapping"
        @command="commandAction"
        @clear="selected = []"
      />
      <p v-if="error || notice" aria-live="polite">{{ error || notice }}</p>
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
.canvas-workspace {
  display: flex;
  flex: 1;
  min-height: 0;
  position: relative;
}
.workspace-panel {
  width: 290px;
  flex: none;
  overflow: auto;
  padding: 8px;
  background: var(--bg-primary);
  border-left: 1px solid var(--glass-border);
  z-index: 35;
}
.widget-select-cover {
  position: absolute;
  inset: 0;
  z-index: 18;
  background: transparent;
  border: 0;
  touch-action: none;
}
.list-select {
  position: absolute;
  z-index: 18;
  top: 0;
  left: 0;
}
.panel-buttons {
  display: flex;
  gap: 6px;
}
.panel-buttons button,
.workspace-panel > button {
  padding: 4px 8px;
  border: 1px solid var(--glass-border);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
}
@media (max-width: 700px) {
  .workspace-panel {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: min(290px, 85%);
  }
}
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
  z-index: 2;
  isolation: isolate;
}
.canvas-item {
  position: absolute;
  container-type: inline-size;
  pointer-events: auto;
  touch-action: auto;
}
.canvas-item.highlight,
.canvas-item.selected {
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
  transform: scale(var(--canvas-inverse));
  transform-origin: top left;
  top: 0;
  left: 0;
  cursor: grab;
}
.canvas-resize-handle {
  z-index: 19;
  transform: scale(var(--canvas-inverse));
  transform-origin: bottom right;
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
