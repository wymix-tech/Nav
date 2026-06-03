<script setup lang="ts">
import { defineAsyncComponent, computed } from 'vue'
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
  docker: defineAsyncComponent(() => import('../widgets/DockerWidget.vue')),
  chat: defineAsyncComponent(() => import('../widgets/ChatWidget.vue')),
}

// 外部组件从 CDN 加载
const externalComponent = computed(() => {
  if (props.widget.source !== 'installed' || !props.manifest) return null
  return defineAsyncComponent({
    loader: () => import(/* @vite-ignore */ props.manifest!.entry),
    timeout: 10000,
    onError(error, retry, fail) {
      console.error('组件加载失败:', error)
      fail()
    },
  })
})

const component = computed(() => {
  if (props.widget.source === 'builtin') {
    return builtinComponents[props.widget.widgetId] ?? null
  }
  return externalComponent.value
})
</script>

<template>
  <Suspense>
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
