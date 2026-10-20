<script setup lang="ts">
import { defineAsyncComponent, computed, provide, ref, watch, onUnmounted } from 'vue'
import { useWidgetStore } from '../stores/widgetStore'
import SandboxWidget from './SandboxWidget.vue'
import type { WidgetInstance, WidgetManifest } from '@nav/shared'

const props = defineProps<{
  widget: WidgetInstance
  manifest?: WidgetManifest
  editing: boolean
  editable: boolean
  resourceActive?: boolean
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
  chat: defineAsyncComponent(() => import('../widgets/ChatWidget.vue')),
  docker: defineAsyncComponent(() => import('../widgets/DockerWidget.vue')),
}

import { useRuntimeContext } from '../runtime/useRuntimeReconciler'
import { widgetOwnerKey } from '../runtime/widgetOwner'
const runtime = useRuntimeContext()
const owner = computed(() => runtime.registry.owners.get(props.widget.id))
provide(widgetOwnerKey, owner)
const viewReady = ref(false)
let detach: (() => void) | undefined
watch(
  () => owner.value?.generation,
  () => {
    detach?.()
    detach = runtime.registry.attach(props.widget.id)
    viewReady.value = false
  },
  { immediate: true, flush: 'sync' },
)
onUnmounted(() => detach?.())
const store = useWidgetStore()
const installed = computed(() => store.getWidget(props.widget.widgetId))
const component = computed(() =>
  props.widget.source === 'builtin' ? builtinComponents[props.widget.widgetId] : null,
)
</script>

<template>
  <div class="widget-renderer" :data-view-ready="viewReady">
    <template v-if="widget.source === 'installed'">
      <SandboxWidget
        v-if="installed?.manifest.manifestVersion === 2"
        :installed="installed"
        @vue:mounted="viewReady = true"
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
        :key="owner?.typeIdentity"
        @vue:mounted="viewReady = true"
        :config="widget.config"
        :resource-active="resourceActive ?? true"
        :instance-id="widget.id"
        :editing="editing"
        :editable="editable"
        @update:config="$emit('update:config', $event)"
      />
      <p v-else class="widget-loading">此组件暂不可用，配置和位置已保留。</p>
      <template #fallback>
        <div class="widget-loading">加载中...</div>
      </template>
    </Suspense>
  </div>
</template>

<style scoped>
.widget-renderer {
  height: 100%;
  min-height: 0;
}
.widget-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  font-size: 14px;
}
</style>
