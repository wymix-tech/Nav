<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import {
  CANVAS,
  layoutProtected,
  groupFor,
  normalizeSelection,
  sceneRanks,
  refKey,
  selectionRect,
  resolveCanvasLabel,
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
import { useCanvasRenderPlan } from '../canvas/useCanvasRenderPlan'
import { useCanvasWorkspace } from '../canvas/useCanvasWorkspace'
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
import CanvasWorkspaceToolbar from './canvas/CanvasWorkspaceToolbar.vue'
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
  highlight = ref<string[]>([])
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
const renderPlan = useCanvasRenderPlan({
  dashboard: () => props.dashboard,
  camera,
  size,
  root,
  list,
  rect: (id) => canvas(props.dashboard.widgets.find((w) => w.id === id)!),
})
watch(draft, renderPlan.schedule, { deep: true })
async function enterWidget(w: WidgetInstance) {
  settleNavigation()
  if (!list.value) fit(canvas(w))
  if (await renderPlan.activate(w.id)) {
    await nextTick()
    root.value
      ?.querySelector<HTMLElement>(
        `[data-widget-id="${w.id}"] .widget-content input, [data-widget-id="${w.id}"] .widget-content textarea, [data-widget-id="${w.id}"] .widget-content button`,
      )
      ?.focus({ preventScroll: true })
  }
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
  renderPlan.cancelActivation()
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
  if (layoutProtected(props.dashboard, w.id)) {
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
  highlight.value = [w.id]
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
const locked = (id: string) => layoutProtected(props.dashboard, id)
const {
  commandAction,
  changeTool,
  selectFromPanel,
  openPanel,
  closePanel,
  locate,
  back,
  namedNavigate,
  located,
} = useCanvasWorkspace({
  dashboard: () => props.dashboard,
  canEdit,
  root,
  tool,
  hand,
  selected,
  additive,
  panel,
  notice,
  highlight,
  camera,
  list,
  presentation,
  names,
  ordered,
  interaction,
  fit,
  settleNavigation,
  choose,
  ensureReady: (id) => renderPlan.activate(id),
})
const overlayBoxes = computed(() => {
  if (!located.value) return selectedBoxes.value
  try {
    return [
      ...selectedBoxes.value,
      { ref: located.value, rect: selectionRect(props.dashboard, located.value) },
    ]
  } catch {
    return selectedBoxes.value
  }
})
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
  <div class="canvas-stage" :class="{ 'is-editing': canEdit }">
    <CanvasWorkspaceToolbar
      class="canvas-ui canvas-navigation"
      :panel="panel"
      panel-id="canvas-workspace-panel"
      spatial
      @open="openPanel"
    />
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
              highlight.includes(w.id),
              draft?.widgets[w.id] ?? null,
              isSelected(w.id),
              locked(w.id),
              ranks[w.id],
              tool,
              names,
              renderPlan.get(w.id),
              list ? ordered : null,
            ]"
            class="canvas-item"
            :class="{ highlight: highlight.includes(w.id), selected: isSelected(w.id) }"
            :data-widget-id="w.id"
            :data-display-level="renderPlan.get(w.id).level"
            :data-view-mounted="renderPlan.get(w.id).mounted"
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
              :mounted="renderPlan.get(w.id).mounted"
              :active="renderPlan.get(w.id).active"
              :level="renderPlan.get(w.id).level"
              :label="resolveCanvasLabel(dashboard, { kind: 'widget', id: w.id }, names)"
              @activate="enterWidget(w)"
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
          :boxes="overlayBoxes"
          :camera="camera"
          :size="size"
          :marquee="marquee"
          :preview="regionDraft"
          :guides="guides"
        />
        <CanvasMinimap
          v-if="minimap && !list && size.width > 0 && size.height > 0"
          v-show="!panel"
          class="canvas-ui map"
          :rects="rects"
          :viewport="visibleBounds(camera, size)"
          @navigate="navigate"
        />
      </section>
      <aside
        v-if="panel"
        id="canvas-workspace-panel"
        class="canvas-ui workspace-panel canvas-chrome"
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
      <p v-if="error || notice" class="canvas-chrome canvas-message" aria-live="polite">
        {{ error || notice }}
      </p>
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
      >
        <template #options>
          <label class="resource-mode"
            >资源模式
            <select v-model="renderPlan.mode.value" aria-label="画布资源模式">
              <option value="safe">自动</option>
              <option value="observe">仅观测</option>
              <option value="full">完整显示</option>
            </select></label
          >
          <span
            class="resource-counts"
            :data-hosts="renderPlan.diagnostics.value.hosts"
            :data-mounted="renderPlan.diagnostics.value.mounted"
            >详情 {{ renderPlan.diagnostics.value.mounted }}/{{
              renderPlan.diagnostics.value.hosts
            }}</span
          >
          <small v-if="renderPlan.diagnostics.value.overBudget"
            >当前详情较多，已优先保留正在使用的组件</small
          >
        </template>
      </CanvasControls>
    </div>
  </div>
</template>
<style scoped>
@layer nav-components {
  .canvas-workspace {
    position: absolute;
    inset: 0;
    min-height: 0;
  }
  .canvas-navigation {
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 45;
  }
  .workspace-panel {
    position: absolute;
    top: 76px;
    right: 16px;
    bottom: var(--dock-clearance);
    width: min(310px, calc(100% - 32px));
    overflow: auto;
    padding: 12px;
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
  .canvas-stage {
    height: 100%;
    min-height: 0;
    position: relative;
    isolation: isolate;
    --dock-clearance: 88px;
  }
  .canvas-stage.is-editing {
    --dock-clearance: 148px;
  }
  .canvas-grid {
    position: absolute;
    inset: 0;
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
    right: 16px;
    bottom: var(--dock-clearance);
    z-index: 30;
  }
  .resource-counts {
    font-size: 12px;
    color: var(--text-secondary);
  }
  .resource-mode {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .dock {
    position: absolute;
    bottom: max(24px, env(safe-area-inset-bottom));
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: max-content;
    max-width: calc(100% - 32px);
    z-index: 40;
    pointer-events: none;
  }
  .dock > * {
    pointer-events: auto;
  }
  .canvas-message {
    position: absolute;
    bottom: calc(100% + 12px);
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 12px;
    width: max-content;
    max-width: min(420px, calc(100vw - 32px));
    font-size: 12px;
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
    padding: 80px 12px var(--dock-clearance);
  }
  .stacked .canvas-item {
    position: relative;
    min-width: 0;
    flex: none;
  }
  @media (max-width: 768px) {
    .dock {
      bottom: max(80px, calc(env(safe-area-inset-bottom) + 64px));
    }
    .canvas-stage {
      --dock-clearance: 144px;
    }
    .canvas-stage.is-editing {
      --dock-clearance: 204px;
    }
    .canvas-navigation {
      top: 12px;
      right: 12px;
    }
    .workspace-panel {
      top: 72px;
      right: 12px;
      width: min(310px, calc(100% - 24px));
    }
    .map {
      right: 12px;
    }
  }
}
</style>
