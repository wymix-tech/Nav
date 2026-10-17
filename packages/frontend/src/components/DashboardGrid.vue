<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import {
  columnsForWidth,
  deriveLayout,
  resolveCollisions,
  normalizeLayout,
  profileKey,
  constraints,
  findPlacement,
  GAP,
  type WidgetInstance,
  type LayoutSettings,
  type LayoutMap,
} from '@nav/shared'
import WidgetWrapper from './WidgetWrapper.vue'
import { useWidgetStore } from '../stores/widgetStore'
const widgetStore = useWidgetStore()
const props = defineProps<{
  widgets: WidgetInstance[]
  editing: boolean
  editable: boolean
  columns?: number
  baseColumns?: number
  rowHeight?: number
  profiles?: Record<string, LayoutMap>
  settings?: LayoutSettings
}>()
const emit = defineEmits<{
  'update-layouts': [layout: LayoutMap, cols: number]
  'remove-widget': [id: string]
  'update-config': [id: string, config: Record<string, any>]
  'reset-profile': [cols: number]
  interaction: [active: boolean]
  'set-base': [layout: LayoutMap, cols: number]
}>()
const root = ref<HTMLElement | null>(null),
  width = ref(1200),
  draft = ref<LayoutMap | null>(null),
  notice = ref('')
const cols = computed(() =>
  columnsForWidth(width.value, props.settings?.columnMode === 'custom' ? props.columns : undefined),
)
const rowHeight = computed(() => props.rowHeight ?? 80)
function minimum(widget: WidgetInstance, colWidth: number) {
  const c = constraints[widget.widgetId],
    manifest = widgetStore.getWidget(widget.widgetId)?.manifest
  return {
    w: Math.min(
      cols.value,
      Math.max(
        manifest?.minSize?.w ?? 1,
        Math.ceil(((c?.minWidth ?? 160) + GAP) / (colWidth + GAP)),
      ),
    ),
    h: Math.max(
      manifest?.minSize?.h ?? 1,
      Math.ceil(((c?.minHeight ?? 80) + GAP) / (rowHeight.value + GAP)),
    ),
  }
}
const derived = computed(() => {
  const result = deriveLayout(
    props.widgets,
    cols.value,
    props.baseColumns ?? props.columns ?? 12,
    props.profiles?.[profileKey(cols.value)],
    width.value,
    rowHeight.value,
  )
  const cw = (width.value - (cols.value - 1) * GAP) / cols.value
  for (const widget of props.widgets) {
    const m = minimum(widget, cw)
    const l = result[widget.id]
    l.w = Math.min(cols.value, Math.max(l.w, m.w))
    l.h = Math.max(l.h, m.h)
  }
  return resolveCollisions(result, cols.value)
})
function organize() {
  const result: LayoutMap = {}
  for (const [id, l] of Object.entries(layout.value).sort(
    ([, a], [, b]) => a.y - b.y || a.x - b.x,
  )) {
    result[id] = findPlacement(result, l.w, l.h, cols.value)
  }
  emit('update-layouts', result, cols.value)
}
const layout = computed(() => draft.value ?? derived.value)
const canEdit = computed(() => props.editing && props.editable)
let observer: ResizeObserver | undefined,
  frame = 0,
  pendingWidth: number | undefined
let interaction: {
  id: string
  mode: 'move' | 'resize'
  pointer: number
  target: HTMLElement
  startX: number
  startY: number
  scrollY: number
  original: LayoutMap
  columns: number
  colWidth: number
} | null = null
function resizeContainer(w: number) {
  if (interaction) pendingWidth = w
  else width.value = w
}
onMounted(() => {
  if (!root.value) return
  resizeContainer(root.value.clientWidth)
  observer = new ResizeObserver((entries) => resizeContainer(entries[0].contentRect.width))
  observer.observe(root.value)
  window.addEventListener('keydown', escape)
})
onUnmounted(() => {
  observer?.disconnect()
  cancel()
  window.removeEventListener('keydown', escape)
})
watch(canEdit, (allowed) => {
  if (!allowed) cancel()
})
watch(
  () => props.widgets.map((w) => w.id).join(','),
  () => cancel(),
)
function cancel() {
  cancelAnimationFrame(frame)
  if (interaction?.target.hasPointerCapture(interaction.pointer))
    interaction.target.releasePointerCapture(interaction.pointer)
  interaction = null
  draft.value = null
  emit('interaction', false)
  if (pendingWidth !== undefined) {
    width.value = pendingWidth
    pendingWidth = undefined
  }
}
function escape(e: KeyboardEvent) {
  if (e.key === 'Escape') cancel()
}
function start(e: PointerEvent, w: WidgetInstance, mode: 'move' | 'resize') {
  if (!canEdit.value || cols.value === 1 || e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  const target = e.currentTarget as HTMLElement
  target.setPointerCapture(e.pointerId)
  emit('interaction', true)
  interaction = {
    id: w.id,
    mode,
    pointer: e.pointerId,
    target,
    startX: e.clientX,
    startY: e.clientY,
    scrollY: window.scrollY,
    original: JSON.parse(JSON.stringify(layout.value)),
    columns: cols.value,
    colWidth: (width.value - (cols.value - 1) * GAP) / cols.value,
  }
  notice.value = ''
}
function move(e: PointerEvent) {
  if (!interaction || e.pointerId !== interaction.pointer) return
  const x = e.clientX,
    y = e.clientY
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => applyMove(x, y))
}
function applyMove(x: number, y: number) {
  if (!interaction) return
  const s = interaction,
    original = s.original[s.id],
    dx = Math.round((x - s.startX) / (s.colWidth + GAP)),
    dy = Math.round((y - s.startY + window.scrollY - s.scrollY) / (rowHeight.value + GAP))
  const next = JSON.parse(JSON.stringify(s.original)) as LayoutMap
  const w = props.widgets.find((w) => w.id === s.id)!,
    m = minimum(w, s.colWidth)
  const minW = m.w
  if (s.mode === 'move')
    next[s.id] = normalizeLayout({ ...original, x: original.x + dx, y: original.y + dy }, s.columns)
  else
    next[s.id] = normalizeLayout(
      {
        ...original,
        w: Math.min(s.columns - original.x, Math.max(minW, original.w + dx)),
        h: Math.max(m.h, original.h + dy),
      },
      s.columns,
    )
  try {
    draft.value = resolveCollisions(next, s.columns, s.id)
  } catch (e) {
    notice.value = (e as Error).message
  }
  if (y > window.innerHeight - 36) window.scrollBy(0, 12)
  else if (y < 36) window.scrollBy(0, -12)
}
function finish(e: PointerEvent) {
  if (!interaction || e.pointerId !== interaction.pointer) return
  cancelAnimationFrame(frame)
  applyMove(e.clientX, e.clientY)
  const next = draft.value,
    usedCols = interaction.columns
  if (next && JSON.stringify(next) !== JSON.stringify(interaction.original))
    emit('update-layouts', next, usedCols)
  cancel()
}
function lostCapture() {
  if (interaction) cancel()
}
function keyboard(e: KeyboardEvent, w: WidgetInstance) {
  if (
    !canEdit.value ||
    !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) ||
    cols.value === 1
  )
    return
  e.preventDefault()
  const next = JSON.parse(JSON.stringify(layout.value))
  const l = next[w.id],
    dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0,
    dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
  const cw = (width.value - (cols.value - 1) * GAP) / cols.value,
    m = minimum(w, cw),
    minW = m.w,
    minH = m.h
  next[w.id] = normalizeLayout(
    e.shiftKey
      ? {
          ...l,
          w: Math.min(cols.value - l.x, Math.max(minW, l.w + dx)),
          h: Math.max(minH, l.h + dy),
        }
      : { ...l, x: l.x + dx, y: l.y + dy },
    cols.value,
  )
  emit('update-layouts', resolveCollisions(next, cols.value, w.id), cols.value)
}
function reorder(id: string, delta: number) {
  const ids = Object.keys(layout.value).sort((a, b) => layout.value[a].y - layout.value[b].y)
  const i = ids.indexOf(id),
    j = i + delta
  if (j < 0 || j >= ids.length) return
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  let y = 0
  const next: LayoutMap = {}
  for (const key of ids) {
    next[key] = { x: 0, y, w: 1, h: layout.value[key].h }
    y += next[key].h
  }
  emit('update-layouts', next, 1)
}
const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${cols.value}, minmax(0,1fr))`,
  gridAutoRows: `${rowHeight.value}px`,
  gap: `${GAP}px`,
}))
function style(id: string) {
  const l = layout.value[id]
  return l ? { gridColumn: `${l.x + 1} / span ${l.w}`, gridRow: `${l.y + 1} / span ${l.h}` } : {}
}
</script>
<template>
  <section ref="root" class="dashboard-grid" :data-columns="cols">
    <div v-if="canEdit" class="grid-info">
      <button @click="organize">自动整理</button
      ><button @click="emit('set-base', layout, cols)">设为基准</button>
      <span>当前 {{ cols }} 列 · 箭头移动，Shift＋箭头调整大小</span
      ><button v-if="profiles?.[profileKey(cols)]" @click="emit('reset-profile', cols)">
        重置当前断点
      </button>
    </div>
    <p v-if="notice" role="alert">{{ notice }}</p>
    <div class="css-grid-layout" :style="gridStyle">
      <div
        v-for="widget in widgets"
        :key="widget.id"
        class="css-grid-item"
        :data-widget-id="widget.id"
        :style="style(widget.id)"
        :class="{ editing: canEdit }"
      >
        <button
          v-if="canEdit && cols > 1"
          class="drag-handle"
          :aria-label="'移动 ' + widget.widgetId"
          @pointerdown="start($event, widget, 'move')"
          @pointermove="move"
          @pointerup="finish"
          @pointercancel="cancel"
          @lostpointercapture="lostCapture"
          @keydown="keyboard($event, widget)"
        >
          ⠿
        </button>
        <div v-if="canEdit && cols === 1" class="stack-actions">
          <button aria-label="上移" @click="reorder(widget.id, -1)">↑</button
          ><button aria-label="下移" @click="reorder(widget.id, 1)">↓</button>
        </div>
        <WidgetWrapper
          :widget="widget"
          :editing="editing"
          :editable="editable"
          @remove="emit('remove-widget', widget.id)"
          @update-config="(config) => emit('update-config', widget.id, config)"
        />
        <button
          v-if="canEdit && cols > 1"
          class="resize-handle"
          :aria-label="'调整 ' + widget.widgetId + ' 大小'"
          @pointerdown="start($event, widget, 'resize')"
          @pointermove="move"
          @pointerup="finish"
          @pointercancel="cancel"
          @lostpointercapture="lostCapture"
        >
          ⌟
        </button>
      </div>
    </div>
  </section>
</template>
<style scoped>
.dashboard-grid {
  width: 100%;
  padding-bottom: 76px;
}
.css-grid-layout {
  position: relative;
  min-height: 200px;
}
.css-grid-item {
  position: relative;
  min-width: 0;
  min-height: 0;
  container-type: inline-size;
  border-radius: var(--radius-md);
}
.css-grid-item.editing {
  outline: 1px dashed var(--accent);
}
.drag-handle {
  position: absolute;
  top: 0;
  left: 8px;
  width: 38px;
  height: 24px;
  padding: 0;
  z-index: 12;
  cursor: grab;
  touch-action: none;
  background: var(--bg-secondary);
  color: var(--text-primary);
}
.resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  z-index: 12;
  padding: 0;
  width: 28px;
  height: 28px;
  cursor: se-resize;
  touch-action: none;
  background: var(--bg-secondary);
  color: var(--text-primary);
}
.grid-info {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}
.stack-actions {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 12;
  display: flex;
}
.stack-actions button {
  padding: 2px 10px;
}
</style>
