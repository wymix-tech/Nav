<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  REGION_COLORS,
  effectiveLocked,
  refKey,
  resolveCanvasLabel,
  type Dashboard,
  type SelectionRef,
  type CanvasCommand,
  type CanvasTypeNames,
} from '@nav/shared'
const props = defineProps<{
  dashboard: Dashboard
  selected: SelectionRef[]
  editable: boolean
  names: CanvasTypeNames
}>()
const emit = defineEmits<{
  select: [ref: SelectionRef, extend: boolean]
  command: [command: CanvasCommand]
  locate: [ref: SelectionRef]
}>()
const expanded = ref<string[]>([]),
  renaming = ref(''),
  name = ref('')
const layers = computed(() => [...(props.dashboard.canvasScene?.layers ?? [])].reverse())
const ownLocked = (r: SelectionRef) =>
  r.kind === 'widget'
    ? props.dashboard.canvasScene?.widgetMeta[r.id]?.locked
    : props.dashboard.canvasScene?.groups.find((g) => g.id === r.id)?.locked
const chosen = (r: SelectionRef) => props.selected.some((x) => refKey(x) === refKey(r))
function rename(r: SelectionRef) {
  renaming.value = refKey(r)
  name.value = resolveCanvasLabel(props.dashboard, r, props.names)
}
function finishRename(r: SelectionRef) {
  emit('command', { type: 'rename', ref: r, title: name.value })
  renaming.value = ''
}
</script>
<template>
  <div class="layers-panel">
    <p>内容图层（从前到后）</p>
    <div v-for="r in layers" :key="refKey(r)" class="layer-row" :class="{ chosen: chosen(r) }">
      <div class="layer-heading">
        <button
          v-if="r.kind === 'group'"
          :aria-expanded="expanded.includes(r.id)"
          aria-label="展开组"
          @click="
            expanded = expanded.includes(r.id)
              ? expanded.filter((id) => id !== r.id)
              : [...expanded, r.id]
          "
        >
          {{ expanded.includes(r.id) ? '▾' : '▸' }}
        </button>
        <button class="label" @click="emit('select', r, $event.shiftKey)">
          {{ r.kind === 'group' ? '组 · ' : '' }}{{ resolveCanvasLabel(dashboard, r, names) }}
        </button>
        <button
          :aria-label="`定位 ${resolveCanvasLabel(dashboard, r, names)}`"
          @click="emit('locate', r)"
        >
          ⌖
        </button>
      </div>
      <p v-if="r.kind === 'group'">
        {{ dashboard.canvasScene?.groups.find((g) => g.id === r.id)?.memberIds.length }} 个成员
      </p>
      <p v-if="r.kind === 'group' && !ownLocked(r) && effectiveLocked(dashboard, r)">
        含锁定成员，请展开后解锁成员。
      </p>
      <div v-if="editable" class="row-actions">
        <button @click="emit('command', { type: 'set-lock', refs: [r], locked: !ownLocked(r) })">
          {{ ownLocked(r) ? '解锁' : '锁定' }}
        </button>
        <button @click="rename(r)">改名</button>
        <button
          v-if="r.kind === 'group'"
          :disabled="effectiveLocked(dashboard, r)"
          @click="emit('command', { type: 'ungroup', refs: [r] })"
        >
          解组
        </button>
        <button
          :disabled="effectiveLocked(dashboard, r)"
          @click="emit('command', { type: 'delete', refs: [r] })"
        >
          {{ r.kind === 'group' ? '删除组及组件' : '删除组件' }}
        </button>
      </div>
      <form v-if="renaming === refKey(r)" @submit.prevent="finishRename(r)">
        <input v-model="name" maxlength="160" aria-label="共享显示名称" /><button>保存名称</button>
        <p>名称会随公开仪表盘展示</p>
      </form>
      <ul v-if="r.kind === 'group' && expanded.includes(r.id)">
        <li
          v-for="id in dashboard.canvasScene?.groups.find((g) => g.id === r.id)?.memberIds"
          :key="id"
        >
          <button @click="emit('select', r, $event.shiftKey)">
            {{ resolveCanvasLabel(dashboard, { kind: 'widget', id }, names) }}
          </button>
          <button
            v-if="editable"
            aria-label="成员前移"
            @click="
              emit('command', {
                type: 'reorder-members',
                groupId: r.id,
                memberIds: [id],
                action: 'forward',
              })
            "
          >
            前移
          </button>
          <button
            v-if="editable"
            aria-label="成员后移"
            @click="
              emit('command', {
                type: 'reorder-members',
                groupId: r.id,
                memberIds: [id],
                action: 'backward',
              })
            "
          >
            后移
          </button>
          <button
            v-if="editable"
            :disabled="effectiveLocked(dashboard, r)"
            @click="emit('command', { type: 'remove-members', groupId: r.id, widgetIds: [id] })"
          >
            从组移出
          </button>
          <button v-if="editable" @click="rename({ kind: 'widget', id })">改成员名称</button>
          <form
            v-if="renaming === refKey({ kind: 'widget', id })"
            @submit.prevent="finishRename({ kind: 'widget', id })"
          >
            <input v-model="name" aria-label="组件共享显示名称" /><button>保存成员名称</button>
            <p>名称会随公开仪表盘展示</p>
          </form>
          <button
            v-if="editable"
            @click="
              emit('command', {
                type: 'set-lock',
                refs: [{ kind: 'widget', id }],
                locked: !dashboard.canvasScene?.widgetMeta[id].locked,
              })
            "
          >
            {{ dashboard.canvasScene?.widgetMeta[id].locked ? '解锁成员' : '锁定成员' }}
          </button>
        </li>
      </ul>
    </div>
    <p>区域背景（无成员）</p>
    <div
      v-for="r in [...(dashboard.canvasScene?.regions ?? [])].reverse()"
      :key="r.id"
      class="layer-row"
      :class="{ chosen: chosen({ kind: 'region', id: r.id }) }"
    >
      <button @click="emit('select', { kind: 'region', id: r.id }, $event.shiftKey)">
        {{ r.title }}
      </button>
      <button @click="emit('locate', { kind: 'region', id: r.id })">定位区域</button>
      <template v-if="editable">
        <button
          @click="
            emit('command', {
              type: 'set-lock',
              refs: [{ kind: 'region', id: r.id }],
              locked: !r.locked,
            })
          "
        >
          {{ r.locked ? '解锁' : '锁定' }}
        </button>
        <button @click="rename({ kind: 'region', id: r.id })">改名</button>
        <button
          :disabled="r.locked"
          @click="emit('command', { type: 'delete', refs: [{ kind: 'region', id: r.id }] })"
        >
          删除区域
        </button>
        <select
          :value="r.color"
          aria-label="区域颜色"
          @change="
            emit('command', {
              type: 'region-color',
              id: r.id,
              color: ($event.target as HTMLSelectElement).value as typeof r.color,
            })
          "
        >
          <option v-for="c in REGION_COLORS" :key="c">{{ c }}</option>
        </select>
        <form
          v-if="renaming === refKey({ kind: 'region', id: r.id })"
          @submit.prevent="finishRename({ kind: 'region', id: r.id })"
        >
          <input v-model="name" aria-label="区域名称" /><button>保存名称</button>
        </form>
      </template>
    </div>
  </div>
</template>
<style scoped>
.layer-row {
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  padding: 8px;
  margin: 6px 0;
}
.chosen {
  border-color: var(--accent);
}
.layer-heading {
  display: flex;
  gap: 4px;
}
.label {
  flex: 1;
  text-align: left;
  min-width: 0;
  overflow-wrap: anywhere;
}
.row-actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
p {
  font-size: 12px;
  color: var(--text-muted);
  margin: 4px 0;
}
button,
select,
input {
  font-size: 12px;
  padding: 4px;
  border: 1px solid var(--glass-border);
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-radius: 4px;
}
button:disabled {
  opacity: 0.4;
}
li {
  margin-top: 4px;
}
</style>
