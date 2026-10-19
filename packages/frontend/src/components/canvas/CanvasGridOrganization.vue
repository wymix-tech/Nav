<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  resolveCanvasLabel,
  type Dashboard,
  type CanvasCommand,
  type SelectionRef,
} from '@nav/shared'
import { useCanvasSelection } from '../../canvas/useCanvasSelection'
import { useCanvasLabels } from '../../canvas/useCanvasLabels'
import { useDashboardStore } from '../../stores/dashboardStore'
import CanvasLayersPanel from './CanvasLayersPanel.vue'
import CanvasSearchPanel from './CanvasSearchPanel.vue'
import CanvasEditTools from './CanvasEditTools.vue'
import CanvasWorkspaceToolbar from './CanvasWorkspaceToolbar.vue'
const props = defineProps<{ dashboard: Dashboard; editable: boolean }>()
const { selected, additive, choose } = useCanvasSelection(() => props.dashboard),
  names = useCanvasLabels(),
  store = useDashboardStore(),
  panel = ref<'' | 'layers' | 'search'>(''),
  notice = ref('')
watch(
  () => props.editable,
  (allowed) => {
    if (!allowed) selected.value = []
  },
)
async function command(c: CanvasCommand) {
  if (!props.editable) return
  const ok = await store.applyCanvasCommand(c)
  notice.value = ok ? '操作已完成' : store.error
}
let previousScroll: { left: number; top: number } | null = null
function back() {
  if (previousScroll) {
    window.scrollTo(previousScroll)
    previousScroll = null
  }
}
function locate(r: SelectionRef) {
  if (r.kind !== 'widget') {
    notice.value = '请切换到画布后进行组或区域空间定位'
    return
  }
  const host = document.querySelector<HTMLElement>(`[data-widget-id="${r.id}"]`)
  if (!host) {
    notice.value = '目标已不存在'
    return
  }
  previousScroll ??= { left: window.scrollX, top: window.scrollY }
  host.scrollIntoView({ block: 'center' })
  host.focus({ preventScroll: true })
  notice.value = `已定位 ${resolveCanvasLabel(props.dashboard, r, names.value)}`
}
</script>
<template>
  <div class="grid-organization">
    <CanvasWorkspaceToolbar
      :panel="panel"
      panel-id="grid-organization-panel"
      @open="(next) => next !== 'views' && (panel = panel === next ? '' : next)"
    />
    <p v-if="notice" role="status">{{ notice }}</p>
    <aside
      v-if="panel"
      id="grid-organization-panel"
      :aria-label="panel === 'layers' ? '图层面板' : '搜索面板'"
    >
      <button @click="panel = ''">关闭面板</button>
      <CanvasEditTools
        v-if="editable"
        :dashboard="dashboard"
        :selected="selected"
        tool="interact"
        :list="true"
        :geometry-tools="false"
        :snapping="false"
        :additive="additive"
        @additive="additive = !additive"
        @command="command"
        @clear="selected = []"
      />
      <CanvasLayersPanel
        v-if="panel === 'layers'"
        :dashboard="dashboard"
        :selected="selected"
        :editable="editable"
        :names="names"
        @select="(r, extend) => editable && choose(r, extend || additive)"
        @command="command"
        @locate="locate"
      />
      <CanvasSearchPanel
        v-else
        :dashboard="dashboard"
        :names="names"
        @locate="locate"
        @back="back"
        @close="panel = ''"
      />
    </aside>
  </div>
</template>
<style scoped>
.grid-organization {
  position: sticky;
  top: 8px;
  z-index: 40;
  font-size: 12px;
  margin-bottom: 16px;
}
button {
  padding: 4px 8px;
  margin: 3px;
  border: 1px solid var(--glass-border);
  color: var(--text-primary);
  background: var(--bg-secondary);
  border-radius: 5px;
}
aside {
  position: fixed;
  right: 12px;
  top: 72px;
  bottom: 110px;
  width: min(320px, 85vw);
  overflow: auto;
  z-index: 100;
  background: var(--bg-primary);
  padding: 10px;
  border: 1px solid var(--glass-border);
  border-radius: 12px;
}
</style>
