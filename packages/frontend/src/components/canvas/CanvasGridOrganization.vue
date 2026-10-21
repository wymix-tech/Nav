<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
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
import CanvasIcon from './CanvasIcon.vue'
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
let trigger: HTMLElement | null = null
function openPanel(next: 'layers' | 'search' | 'views') {
  if (next === 'views') {
    return
  }
  trigger = document.activeElement as HTMLElement
  panel.value = panel.value === next ? '' : next
}
function closePanel() {
  panel.value = ''
  nextTick(() => trigger?.focus())
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
    <CanvasWorkspaceToolbar :panel="panel" panel-id="grid-organization-panel" @open="openPanel" />
    <p v-if="notice" role="status">{{ notice }}</p>
    <aside
      v-if="panel"
      id="grid-organization-panel"
      class="canvas-chrome"
      @keydown.esc.stop="closePanel"
      :aria-label="panel === 'layers' ? '图层面板' : '搜索面板'"
    >
      <header class="grid-panel-header">
        <h2>{{ panel === 'layers' ? '图层' : '搜索画布' }}</h2>
        <button aria-label="关闭面板" title="关闭面板" @click="closePanel">
          <CanvasIcon name="close" />
        </button>
      </header>
      <CanvasEditTools
        v-if="editable"
        :dashboard="dashboard"
        :selected="selected"
        tool="interact"
        :list="true"
        :geometry-tools="false"
        embedded
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
        @close="closePanel"
      />
    </aside>
  </div>
</template>
<style scoped>
@layer nav-components {
  .grid-organization {
    position: sticky;
    top: 8px;
    z-index: 40;
    font-size: 12px;
    margin-bottom: 16px;
  }
  .grid-organization > p {
    padding: 6px 12px;
    color: var(--text-secondary);
  }
  .grid-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 8px;
    margin-bottom: 8px;
    border-bottom: 1px solid var(--glass-border);
  }
  .grid-panel-header h2 {
    font-size: 14px;
    font-weight: 600;
  }
  .grid-panel-header button {
    width: 36px;
    padding: 0;
  }
  aside {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    width: min(340px, calc(100vw - 32px));
    max-height: min(65dvh, calc(100dvh - 220px));
    overflow: auto;
    overscroll-behavior: contain;
    padding: 12px;
    z-index: 50;
  }
}
</style>
