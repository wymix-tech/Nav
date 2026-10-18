import { computed } from 'vue'
import { useWidgetStore } from '../stores/widgetStore'
export const builtinWidgets = [
  { id: 'search', name: '搜索框', icon: '🔍' },
  { id: 'clock', name: '时钟', icon: '🕐' },
  { id: 'weather', name: '天气', icon: '🌤️' },
  { id: 'bookmark', name: '书签', icon: '📑' },
  { id: 'monitor', name: '监控', icon: '📊' },
  { id: 'docker', name: 'Docker 监控', icon: '🐳' },
  { id: 'chat', name: 'AI 助手', icon: '✦' },
]
export function useCanvasLabels() {
  const store = useWidgetStore()
  return computed(() =>
    Object.fromEntries([
      ...builtinWidgets.map((w) => [w.id, w.name]),
      ...store.installedWidgets.map((w) => [w.widgetId, w.manifest.displayName]),
    ]),
  )
}
