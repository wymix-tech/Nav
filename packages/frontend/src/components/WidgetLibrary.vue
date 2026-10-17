<script setup lang="ts">
import { useWidgetStore } from '../stores/widgetStore'
import { useDashboardStore } from '../stores/dashboardStore'
import { constraints, findPlacement, migrateDashboard } from '@nav/shared'

const widgetStore = useWidgetStore()
const dashboardStore = useDashboardStore()

const emit = defineEmits<{
  'show-install': []
  'toggle-library': []
}>()

defineProps<{
  visible: boolean
}>()

function addToDashboard(widgetId: string, source: 'builtin' | 'installed') {
  const dashboard = dashboardStore.dashboard
  if (!dashboard) return
  try {
    const cols = dashboard.baseColumns ?? dashboard.columns
    const size = constraints[widgetId] ??
      widgetStore.getWidget(widgetId)?.manifest.size ?? { w: 4, h: 3 }
    const placed = Object.fromEntries(dashboard.widgets.map((w) => [w.id, w.layouts.lg]))
    const layout = findPlacement(placed, Math.min(size.w, cols), size.h, cols)
    const id = crypto.randomUUID()
    const instance = {
      id,
      widgetId,
      source,
      config: {},
      layouts: { lg: layout, md: layout, sm: layout, xs: layout },
    }
    if (dashboard.layoutMode === 'canvas') {
      const d = migrateDashboard({ ...dashboard, widgets: [...dashboard.widgets, instance] })
      const added = d.widgets[d.widgets.length - 1]
      const existing = dashboard.widgets.flatMap((w) => (w.canvas ? [w.canvas] : []))
      if (existing.length && added.canvas)
        added.canvas.y = Math.max(...existing.map((c) => c.y + c.h)) + 20
      void dashboardStore.addWidget(added)
    } else void dashboardStore.addWidget(instance)
  } catch (e) {
    dashboardStore.error = (e as Error).message
  }
}

const builtinWidgets = [
  { id: 'search', name: '搜索框', icon: '🔍' },
  { id: 'clock', name: '时钟', icon: '🕐' },
  { id: 'weather', name: '天气', icon: '🌤️' },
  { id: 'bookmark', name: '书签', icon: '📑' },
  { id: 'monitor', name: '监控', icon: '📊' },
  { id: 'docker', name: 'Docker 监控', icon: '🐳' },
  { id: 'chat', name: 'AI 助手', icon: '✦' },
]
async function uninstall(id: string) {
  try {
    await widgetStore.uninstall(id)
    widgetStore.error = ''
  } catch (e) {
    widgetStore.error = (e as Error).message
  }
}
</script>

<template>
  <div class="library-wrapper" :class="{ visible }">
    <div class="library-panel">
      <div class="library-header">
        <h3>组件库</h3>
        <div class="header-actions">
          <button class="install-btn" @click="emit('show-install')">安装组件</button>
          <button class="collapse-btn" @click="emit('toggle-library')" title="收起">✕</button>
        </div>
      </div>

      <div class="section">
        <h4>内置组件</h4>
        <div class="widget-list">
          <div
            v-for="w in builtinWidgets"
            :key="w.id"
            class="widget-item"
            role="button"
            tabindex="0"
            @keydown.enter="addToDashboard(w.id, 'builtin')"
            @click="addToDashboard(w.id, 'builtin')"
          >
            <span class="widget-icon">{{ w.icon }}</span>
            <span class="widget-name">{{ w.name }}</span>
          </div>
        </div>
      </div>

      <div v-if="widgetStore.installedWidgets.length > 0" class="section">
        <h4>已安装组件</h4>
        <p v-if="widgetStore.error" role="alert">{{ widgetStore.error }}</p>
        <div class="widget-list">
          <div
            v-for="w in widgetStore.installedWidgets"
            :key="w.widgetId"
            class="widget-item"
            @click="addToDashboard(w.widgetId, 'installed')"
          >
            <span class="widget-icon">{{ w.manifest.icon }}</span>
            <span class="widget-name">{{ w.manifest.displayName }}</span
            ><button @click.stop="uninstall(w.widgetId)">卸载</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.library-wrapper {
  position: fixed;
  left: 12px;
  top: 24px;
  bottom: 88px;
  z-index: 90;
  transform: translateY(20px);
  opacity: 0;
  pointer-events: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.library-wrapper.visible {
  transform: translateY(0);
  opacity: 1;
  pointer-events: all;
}

.library-panel {
  width: 260px;
  max-height: calc(100dvh - 120px);
  overflow-y: auto;
  background: var(--glass-bg);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-lg);
}

.library-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

.library-header h3 {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.header-actions {
  display: flex;
  gap: 6px;
}

.install-btn {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  color: white;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(96, 165, 250, 0.25);
}

.install-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(96, 165, 250, 0.35);
}

.collapse-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}

.collapse-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.section {
  margin-bottom: 16px;
}

.section:last-child {
  margin-bottom: 0;
}

.section h4 {
  font-family: var(--font-body);
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  font-weight: 600;
}

.widget-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.widget-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--text-primary);
  transition: all 0.2s;
}

.widget-item:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
  transform: translateY(-1px);
}

.widget-item:active {
  transform: translateY(0);
}

.widget-icon {
  font-size: 16px;
}

/* 手机端：底部抽屉 */
@media (max-width: 1099px) {
  .library-wrapper {
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    transform: translateY(100%);
  }

  .library-wrapper.visible {
    transform: translateY(0);
  }

  .library-panel {
    width: 100%;
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    max-height: 50vh;
    overflow-y: auto;
  }
}
</style>
