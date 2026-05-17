<script setup lang="ts">
import { computed } from 'vue'
import { GridLayout, GridItem } from 'vue3-grid-layout-next'
import type { WidgetInstance } from '@nav/shared'
import WidgetWrapper from './WidgetWrapper.vue'

const props = defineProps<{
  widgets: WidgetInstance[]
  editing: boolean
  editable: boolean
}>()

const emit = defineEmits<{
  'update-layout': [instanceId: string, layouts: WidgetInstance['layouts']]
  'remove-widget': [instanceId: string]
  'update-config': [instanceId: string, config: Record<string, any>]
}>()

/**
 * 将 WidgetInstance 的 layouts 转换为 vue-grid-layout 所需格式
 */
function toGridLayouts(widgets: WidgetInstance[]) {
  const result: Record<string, any[]> = { lg: [], md: [], sm: [], xs: [] }
  for (const w of widgets) {
    for (const [bp, layout] of Object.entries(w.layouts)) {
      result[bp].push({
        i: w.id,
        x: layout.x,
        y: layout.y,
        w: layout.w,
        h: layout.h,
        minW: 2,
        minH: 2,
      })
    }
  }
  return result
}

const layouts = computed(() => toGridLayouts(props.widgets))

/**
 * 处理布局更新事件，将变化同步到 store
 */
function handleLayoutUpdated(newLayout: any[]) {
  for (const item of newLayout) {
    const widget = props.widgets.find((w) => w.id === item.i)
    if (!widget) continue
    emit('update-layout', item.i, {
      ...widget.layouts,
      lg: { x: item.x, y: item.y, w: item.w, h: item.h },
    })
  }
}
</script>

<template>
  <div class="dashboard-grid">
    <GridLayout
      :layout="layouts.lg"
      :col-num="12"
      :row-height="80"
      :is-draggable="editing"
      :is-resizable="editing"
      :responsive="true"
      :breakpoints="{ lg: 1200, md: 992, sm: 768, xs: 480, xxs: 0 }"
      :cols="{ lg: 12, md: 8, sm: 6, xs: 4, xxs: 2 }"
      @layout-updated="handleLayoutUpdated"
    >
      <GridItem
        v-for="widget in widgets"
        :key="widget.id"
        :i="widget.id"
        :x="layouts.lg.find((l: any) => l.i === widget.id)?.x ?? 0"
        :y="layouts.lg.find((l: any) => l.i === widget.id)?.y ?? 0"
        :w="layouts.lg.find((l: any) => l.i === widget.id)?.w ?? 4"
        :h="layouts.lg.find((l: any) => l.i === widget.id)?.h ?? 3"
        :min-w="2"
        :min-h="2"
      >
        <WidgetWrapper
          :widget="widget"
          :editing="editing"
          :editable="editable"
          @remove="emit('remove-widget', widget.id)"
          @update-config="(config) => emit('update-config', widget.id, config)"
        />
      </GridItem>
    </GridLayout>
  </div>
</template>

<style scoped>
.dashboard-grid {
  width: 100%;
}
</style>
