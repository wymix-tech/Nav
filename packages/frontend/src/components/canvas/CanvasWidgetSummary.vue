<script setup lang="ts">
import { computed, shallowRef, watch, onUnmounted } from 'vue'
import type { WidgetInstance } from '@nav/shared'
import { useRuntimeContext } from '../../runtime/useRuntimeReconciler'
import { getWeatherSummary } from '../../services/weatherService'
import { getMonitorSummary } from '../../services/monitorService'
import { getDockerSummary } from '../../services/dockerService'
import { currentClock, subscribeClock } from '../../services/clockService'
const props = defineProps<{
  widget: WidgetInstance
  label: string
  level: string
  editable: boolean
}>()
const runtime = useRuntimeContext(),
  clock = shallowRef(currentClock())
let release: (() => void) | undefined
watch(
  () => [props.level, props.widget.source, props.widget.widgetId],
  () => {
    release?.()
    release =
      props.level === 'summary' &&
      props.widget.source === 'builtin' &&
      props.widget.widgetId === 'clock'
        ? subscribeClock('minute', (value) => {
            clock.value = value
          }).release
        : undefined
  },
  { immediate: true },
)
onUnmounted(() => release?.())
const summary = computed(() => {
  if (props.widget.source !== 'builtin') return '插件'
  const owner = runtime.registry.owners.get(props.widget.id)
  if (owner?.kind === 'chat')
    return `${owner.chat.messages.value.length} 条消息 · ${owner.chat.loading.value ? '正在生成' : owner.chat.error.value ? '已停止或中断' : '就绪'}`
  if (props.widget.widgetId === 'clock') return clock.value.time
  if (props.widget.widgetId === 'weather') {
    const city = props.widget.config.city || 'Beijing',
      value = getWeatherSummary(city, props.widget.config.unit)
    return value
      ? `${city} · ${value.temp}°${props.widget.config.unit === 'imperial' ? 'F' : 'C'} · ${new Date(value.time).toLocaleTimeString()}`
      : `${city} · 待加载`
  }
  if (props.editable && props.widget.widgetId === 'monitor') {
    const value = getMonitorSummary(props.widget.config.diskPaths ?? ['/'])
    return value ? `${value.hostname} · CPU ${Math.round(value.cpu)}%` : '待加载'
  }
  if (props.editable && props.widget.widgetId === 'docker') {
    const value = getDockerSummary(props.widget.config.containerName)
    return value ? `${value.state} · CPU ${Math.round(value.cpu)}%` : '待加载'
  }
  if (props.widget.widgetId === 'bookmark')
    return `${Array.isArray(props.widget.config.groups) ? props.widget.config.groups.length : 0} 个分组`
  return ''
})
</script>
<template>
  <strong>{{ label || widget.widgetId }}</strong
  ><small v-if="level === 'summary'">{{ summary }}</small
  ><span v-if="level !== 'outline'">进入组件</span>
</template>
