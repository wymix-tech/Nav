<script setup lang="ts">
import { defineAsyncComponent, computed } from 'vue'
import { useWidgetStore } from '../stores/widgetStore'
import SandboxWidget from './SandboxWidget.vue'
import type { WidgetInstance, WidgetManifest } from '@nav/shared'

const props = defineProps<{
  widget: WidgetInstance
  manifest?: WidgetManifest
  editing: boolean
  editable: boolean
}>()

defineEmits<{
  'update:config': [value: Record<string, any>]
}>()

// 内置组件映射
const builtinComponents: Record<string, any> = {
  search: defineAsyncComponent(() => import('../widgets/SearchWidget.vue')),
  clock: defineAsyncComponent(() => import('../widgets/ClockWidget.vue')),
  weather: defineAsyncComponent(() => import('../widgets/WeatherWidget.vue')),
  bookmark: defineAsyncComponent(() => import('../widgets/BookmarkWidget.vue')),
  monitor: defineAsyncComponent(() => import('../widgets/MonitorWidget.vue')),
}

const store = useWidgetStore()
const installed = computed(() => store.getWidget(props.widget.widgetId))
const component = computed(() =>
  props.widget.source === 'builtin' ? builtinComponents[props.widget.widgetId] : null,
)
</script>

<template>
  <template v-if="widget.source === 'installed'">
    <SandboxWidget
      v-if="installed?.manifest.manifestVersion === 2"
      :installed="installed"
      :config="widget.config"
      :editable="editable"
      @update:config="$emit('update:config', $event)"
    />
    <p v-else class="widget-loading">旧插件需要升级到隔离协议 v2；配置和位置已保留。</p>
  </template>
  <Suspense v-else>
    <component
      v-if="component"
      :is="component"
      :config="widget.config"
      :editing="editing"
      :editable="editable"
      @update:config="$emit('update:config', $event)"
    />
    <template #fallback>
      <div class="widget-loading">加载中...</div>
    </template>
  </Suspense>
</template>

<style scoped>
.widget-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  font-size: 14px;
}
</style>
