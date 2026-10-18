<script setup lang="ts">
import { computed } from 'vue'
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
  <div class="edit-tools" role="toolbar" aria-label="画布编辑工具">
    <button
      v-if="geometryTools !== false"
      :aria-pressed="tool === 'interact'"
      @click="emit('tool', 'interact')"
    >
      交互工具
    </button>
    <button
      v-if="geometryTools !== false"
      :aria-pressed="tool === 'select'"
      @click="emit('tool', 'select')"
    >
      选择工具
    </button>
    <button
      v-if="geometryTools !== false"
      :disabled="list"
      :aria-pressed="tool === 'region'"
      @click="emit('tool', 'region')"
    >
      区域工具
    </button>
    <button :aria-pressed="additive" @click="emit('additive')">增减选择</button>
    <button
      v-if="geometryTools !== false"
      :disabled="list"
      :aria-pressed="snapping"
      @click="emit('snapping')"
    >
      吸附
    </button>
    <span>{{ selected.length }} 项选中</span
    ><span v-if="blocked">{{ blocked }} 项布局受锁定保护，请先解锁。</span>
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
      v-for="(label, action) in { forward: '前移', backward: '后移', front: '置顶', back: '置底' }"
      :key="action"
      :disabled="!selected.length"
      @click="emit('command', { type: 'reorder', refs: selected, action })"
    >
      {{ label }}
    </button>
  </div>
</template>
<style scoped>
.edit-tools {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  align-items: center;
  font-size: 11px;
  max-height: 96px;
  overflow: auto;
  padding: 4px 0;
}
.edit-tools button {
  padding: 4px 6px;
  background: var(--bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: 5px;
  color: var(--text-primary);
}
button[aria-pressed='true'] {
  border-color: var(--accent);
  color: var(--accent);
}
button:disabled {
  opacity: 0.4;
}
</style>
