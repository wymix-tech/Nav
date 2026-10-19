<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import CanvasIcon from './CanvasIcon.vue'
import './canvasChrome.css'
import {
  CANVAS,
  effectiveLocked,
  contentBounds,
  selectionRect,
  type Dashboard,
  type SelectionRef,
  type CanvasCommand,
  type AlignAction,
} from '@nav/shared'
import type { CanvasTool } from '../../canvas/useCanvasInteraction'
const props = withDefaults(
  defineProps<{
    dashboard: Dashboard
    selected: SelectionRef[]
    tool: CanvasTool
    additive: boolean
    snapping: boolean
    list: boolean
    geometryTools?: boolean
  }>(),
  { geometryTools: true },
)
const emit = defineEmits<{
  tool: [tool: CanvasTool]
  additive: []
  snapping: []
  command: [command: CanvasCommand]
  clear: []
}>()
const menu = ref<HTMLDetailsElement | null>(null)
function dismiss(event: PointerEvent) {
  if (menu.value && !menu.value.contains(event.target as Node)) {
    menu.value.open = false
  }
}
function escape(event: KeyboardEvent) {
  if (menu.value?.open) {
    event.stopPropagation()
    closeMenu()
  }
}
function closeMenu() {
  if (menu.value) {
    menu.value.open = false
    menu.value.querySelector('summary')?.focus()
  }
}
onMounted(() => document.addEventListener('pointerdown', dismiss, true))
onUnmounted(() => document.removeEventListener('pointerdown', dismiss, true))
const blocked = computed(
  () => props.selected.filter((r) => effectiveLocked(props.dashboard, r)).length,
)
const aligns: { action: AlignAction; label: string }[] = [
  { action: 'left', label: '左对齐' },
  { action: 'center', label: '水平居中' },
  { action: 'right', label: '右对齐' },
  { action: 'top', label: '顶部对齐' },
  { action: 'middle', label: '垂直居中' },
  { action: 'bottom', label: '底部对齐' },
]
function enclose() {
  const b = contentBounds(
    props.selected.filter((r) => r.kind !== 'region').map((r) => selectionRect(props.dashboard, r)),
  )
  if (!b) return
  const p = CANVAS.positionLimit,
    end = p + CANVAS.maxSize,
    x = Math.max(-p, b.x - 24),
    y = Math.max(-p, b.y - 24)
  emit('command', {
    type: 'create-region',
    bounded: x !== b.x - 24 || y !== b.y - 24 || b.x + b.w + 24 > end || b.y + b.h + 24 > end,
    region: {
      id: crypto.randomUUID(),
      title: '所选区域',
      x,
      y,
      w: Math.max(40, Math.min(end, b.x + b.w + 24) - x),
      h: Math.max(40, Math.min(end, b.y + b.h + 24) - y),
      color: 'blue',
      locked: false,
    },
  })
}
function group() {
  emit('command', {
    type: 'group',
    id: crypto.randomUUID(),
    widgetIds: props.selected.map((r) => r.id),
    title: '新分组',
  })
}
function join() {
  const g = props.selected.find((r) => r.kind === 'group')
  if (g)
    emit('command', {
      type: 'join-group',
      groupId: g.id,
      widgetIds: props.selected.filter((r) => r.kind === 'widget').map((r) => r.id),
    })
}
</script>
<template>
  <div class="edit-tools canvas-chrome" role="toolbar" aria-label="画布编辑工具">
    <button
      v-if="geometryTools !== false"
      :aria-pressed="tool === 'interact'"
      :aria-label="tool === 'interact' ? '交互工具' : '进入组件'"
      title="交互工具"
      @click="emit('tool', 'interact')"
    >
      <CanvasIcon name="cursor" />
    </button>
    <button
      v-if="geometryTools !== false"
      :aria-pressed="tool === 'select'"
      aria-label="选择工具"
      title="选择工具"
      @click="emit('tool', 'select')"
    >
      <CanvasIcon name="select" />
    </button>
    <button
      v-if="geometryTools !== false"
      :disabled="list"
      :aria-pressed="tool === 'region'"
      aria-label="区域工具"
      title="区域工具"
      @click="emit('tool', 'region')"
    >
      <CanvasIcon name="region" />
    </button>
    <button
      :aria-pressed="additive"
      aria-label="增减选择"
      title="增减选择"
      @click="emit('additive')"
    >
      <CanvasIcon name="additive" />
    </button>
    <button
      v-if="geometryTools !== false"
      :disabled="list"
      aria-label="吸附"
      title="吸附"
      :aria-pressed="snapping"
      @click="emit('snapping')"
    >
      <CanvasIcon name="snap" />
    </button>
    <span>{{ selected.length }} 项选中</span>
    <details ref="menu" class="edit-menu" @keydown.esc="escape">
      <summary aria-label="排列与分组" title="排列与分组"><CanvasIcon name="more" /></summary>
      <div class="edit-actions canvas-chrome">
        <span v-if="blocked">{{ blocked }} 项布局受锁定保护，请先解锁。</span>
        <button :disabled="!selected.length" @click="emit('clear')">清除选择</button>
        <button
          :disabled="!!blocked || selected.length < 2 || selected.some((r) => r.kind !== 'widget')"
          @click="group"
        >
          分组
        </button>
        <button
          :disabled="!!blocked || !selected.length || selected.some((r) => r.kind !== 'group')"
          @click="emit('command', { type: 'ungroup', refs: selected })"
        >
          解组
        </button>
        <button
          :disabled="
            !!blocked ||
            selected.filter((r) => r.kind === 'group').length !== 1 ||
            !selected.some((r) => r.kind === 'widget') ||
            selected.some((r) => r.kind === 'region')
          "
          @click="join"
        >
          加入此组
        </button>
        <button
          :disabled="!selected.length"
          @click="emit('command', { type: 'set-lock', refs: selected, locked: true })"
        >
          锁定所选
        </button>
        <button
          :disabled="!selected.length"
          @click="emit('command', { type: 'set-lock', refs: selected, locked: false })"
        >
          解锁所选
        </button>
        <button
          :disabled="!!blocked || !selected.length"
          @click="emit('command', { type: 'delete', refs: selected })"
        >
          删除所选及组内组件
        </button>
        <button :disabled="list || !selected.some((r) => r.kind !== 'region')" @click="enclose">
          框住所选
        </button>
        <button
          v-for="a in aligns"
          :key="a.action"
          :disabled="!!blocked || list || selected.length < 2"
          @click="emit('command', { type: 'align', refs: selected, action: a.action })"
        >
          {{ a.label }}
        </button>
        <button
          :disabled="!!blocked || list || selected.length < 3"
          @click="emit('command', { type: 'distribute', refs: selected, axis: 'x' })"
        >
          水平等距
        </button>
        <button
          :disabled="!!blocked || list || selected.length < 3"
          @click="emit('command', { type: 'distribute', refs: selected, axis: 'y' })"
        >
          垂直等距
        </button>
        <button
          v-for="(label, action) in {
            forward: '前移',
            backward: '后移',
            front: '置顶',
            back: '置底',
          }"
          :key="action"
          :disabled="!selected.length"
          @click="emit('command', { type: 'reorder', refs: selected, action })"
        >
          {{ label }}
        </button>
      </div>
    </details>
  </div>
</template>
<style scoped>
.edit-tools {
  display: flex;
  gap: 2px;
  align-items: center;
  font-size: 11px;
  padding: 6px;
  position: relative;
  max-width: 100%;
}
.edit-tools > button {
  width: 36px;
  flex: none;
  padding: 0;
}
.edit-tools > span {
  padding-inline: 8px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.edit-menu > summary {
  width: 36px;
  padding: 0;
}
.edit-actions {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 12px;
  width: min(380px, calc(100vw - 32px));
  max-height: min(320px, 45dvh);
  overflow: auto;
}
.edit-actions > span {
  width: 100%;
}
@media (max-width: 600px) {
  .edit-tools {
    padding: 4px;
  }
  .edit-tools > button,
  .edit-menu > summary {
    width: 32px;
  }
}
</style>
