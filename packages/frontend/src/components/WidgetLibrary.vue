<script setup lang="ts">
import { useWidgetStore } from '../stores/widgetStore'
import { useDashboardStore } from '../stores/dashboardStore'
import type { WidgetInstance, WidgetLayout } from '@nav/shared'

const widgetStore = useWidgetStore()
const dashboardStore = useDashboardStore()

const emit = defineEmits<{
  'show-install': []
}>()

function createDefaultLayout(row: number): WidgetLayout {
  return { x: 0, y: row, w: 4, h: 3 }
}

function addToDashboard(widgetId: string, source: 'builtin' | 'installed') {
  const existingWidgets = dashboardStore.dashboard?.widgets ?? []
  const maxY = existingWidgets.reduce((max, w) => {
    const lg = w.layouts.lg
    return Math.max(max, lg.y + lg.h)
  }, 0)

  const instance: WidgetInstance = {
    id: `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    widgetId,
    source,
    config: {},
    layouts: {
      lg: createDefaultLayout(maxY),
      md: createDefaultLayout(maxY),
      sm: createDefaultLayout(maxY),
      xs: createDefaultLayout(maxY),
    },
  }
  dashboardStore.addWidget(instance)
}

const builtinWidgets = [
  { id: 'search', name: '搜索框', icon: '🔍' },
  { id: 'clock', name: '时钟', icon: '🕐' },
  { id: 'weather', name: '天气', icon: '🌤️' },
  { id: 'bookmark', name: '书签', icon: '📑' },
]
</script>

<template>
  <div class="widget-library">
    <div class="library-header">
      <h3>组件库</h3>
      <button class="primary" @click="emit('show-install')">安装组件</button>
    </div>

    <div class="section">
      <h4>内置组件</h4>
      <div class="widget-list">
        <div
          v-for="w in builtinWidgets"
          :key="w.id"
          class="widget-item"
          @click="addToDashboard(w.id, 'builtin')"
        >
          <span class="widget-icon">{{ w.icon }}</span>
          <span class="widget-name">{{ w.name }}</span>
        </div>
      </div>
    </div>

    <div v-if="widgetStore.installedWidgets.length > 0" class="section">
      <h4>已安装组件</h4>
      <div class="widget-list">
        <div
          v-for="w in widgetStore.installedWidgets"
          :key="w.widgetId"
          class="widget-item"
          @click="addToDashboard(w.widgetId, 'installed')"
        >
          <span class="widget-icon">{{ w.manifest.icon }}</span>
          <span class="widget-name">{{ w.manifest.displayName }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.widget-library {
  padding: 16px;
}

.library-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.library-header h3 {
  font-size: 16px;
}

.section {
  margin-bottom: 16px;
}

.section h4 {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.widget-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.widget-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background-color: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 13px;
  transition: border-color 0.2s;
}

.widget-item:hover {
  border-color: var(--accent);
}

.widget-icon {
  font-size: 18px;
}
</style>
