<script setup lang="ts">
import { computed, ref } from 'vue'
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

type Breakpoint = 'lg' | 'md' | 'sm' | 'xs'
const currentBreakpoint = ref<Breakpoint>('lg')

const breakpoints = { lg: 1200, md: 992, sm: 768, xs: 480, xxs: 0 }
const cols = { lg: 12, md: 8, sm: 6, xs: 4, xxs: 2 }

function detectBreakpoint(): Breakpoint {
  const w = window.innerWidth
  if (w >= breakpoints.lg) return 'lg'
  if (w >= breakpoints.md) return 'md'
  if (w >= breakpoints.sm) return 'sm'
  return 'xs'
}

function toGridLayouts(widgets: WidgetInstance[]) {
  const result: Record<string, any[]> = { lg: [], md: [], sm: [], xs: [] }
  for (const w of widgets) {
    for (const bp of ['lg', 'md', 'sm', 'xs'] as Breakpoint[]) {
      const layout = w.layouts[bp] ?? w.layouts.lg
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

const layoutIndex = computed(() => {
  const map = new Map<string, any>()
  for (const item of layouts.value[currentBreakpoint.value] ?? []) {
    map.set(item.i, item)
  }
  return map
})

function handleBreakpointChanged(bp: string) {
  if (bp in breakpoints) {
    currentBreakpoint.value = bp as Breakpoint
  }
}

function handleLayoutUpdated(newLayout: any[]) {
  const bp = currentBreakpoint.value
  for (const item of newLayout) {
    const widget = props.widgets.find((w) => w.id === item.i)
    if (!widget) continue
    emit('update-layout', item.i, {
      ...widget.layouts,
      [bp]: { x: item.x, y: item.y, w: item.w, h: item.h },
    })
  }
}
</script>

<template>
  <div class="dashboard-grid">
    <GridLayout
      :layout="layouts[currentBreakpoint]"
      :col-num="cols[currentBreakpoint]"
      :row-height="80"
      :is-draggable="editing"
      :is-resizable="editing"
      :responsive="true"
      :breakpoints="breakpoints"
      :cols="cols"
      @layout-updated="handleLayoutUpdated"
      @breakpoint-changed="handleBreakpointChanged"
    >
      <GridItem
        v-for="widget in widgets"
        :key="widget.id"
        :i="widget.id"
        :x="layoutIndex.get(widget.id)?.x ?? 0"
        :y="layoutIndex.get(widget.id)?.y ?? 0"
        :w="layoutIndex.get(widget.id)?.w ?? 4"
        :h="layoutIndex.get(widget.id)?.h ?? 3"
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
