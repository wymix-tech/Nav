<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { GridLayout, GridItem } from 'vue-grid-layout-v3'
import type { WidgetInstance } from '@nav/shared'
import WidgetWrapper from './WidgetWrapper.vue'

const props = defineProps<{
  widgets: WidgetInstance[]
  editing: boolean
  editable: boolean
  columns?: number
}>()

const emit = defineEmits<{
  'update-layout': [instanceId: string, layouts: WidgetInstance['layouts']]
  'remove-widget': [instanceId: string]
  'update-config': [instanceId: string, config: Record<string, any>]
}>()

const breakpoints = { lg: 1200, md: 992, sm: 768, xs: 480, xxs: 0 }
const lgCols = computed(() => props.columns ?? 12)
const cols = computed(() => ({ lg: lgCols.value, md: 8, sm: 6, xs: 4, xxs: 2 }))
const LIB_COLS = computed(() => lgCols.value)

function detectBreakpoint(width: number): string {
  const sorted = Object.entries(breakpoints).sort((a, b) => a[1] - b[1])
  let result = sorted[0][0]
  for (const [bp, min] of sorted) {
    if (width > min) result = bp
  }
  return result
}

const currentBreakpoint = ref('lg')

function updateBreakpoint() {
  currentBreakpoint.value = detectBreakpoint(window.innerWidth)
}

onMounted(() => {
  updateBreakpoint()
  window.addEventListener('resize', updateBreakpoint)
})
onUnmounted(() => {
  window.removeEventListener('resize', updateBreakpoint)
})

function toGridLayouts(widgets: WidgetInstance[], libCols: number) {
  const result: Record<string, any[]> = { lg: [], md: [], sm: [], xs: [] }
  for (const w of widgets) {
    for (const bp of ['lg', 'md', 'sm', 'xs'] as const) {
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

  // 修正越界
  const colNums = { lg: libCols, md: 8, sm: 6, xs: 4 }
  for (const bp of ['lg', 'md', 'sm', 'xs'] as const) {
    const maxCols = colNums[bp]
    const items = result[bp]
    for (const item of items) {
      if (item.x + item.w > maxCols) {
        item.x = 0
        item.y += item.h
      }
    }
    // 缩放到自定义列数
    const scale = libCols / maxCols
    for (const item of items) {
      item.x = Math.round(item.x * scale)
      item.w = Math.round(item.w * scale)
    }
  }

  return result
}

const allLayouts = computed(() => toGridLayouts(props.widgets, LIB_COLS.value))

// 当前断点的布局（缩放到 12 列）
const currentLayoutScaled = computed(() => {
  return allLayouts.value[currentBreakpoint.value] ?? allLayouts.value.lg
})

const layoutIndex = computed(() => {
  const map = new Map<string, any>()
  for (const item of currentLayoutScaled.value) {
    map.set(item.i, item)
  }
  return map
})

function handleLayoutUpdated(newLayout: any[]) {
  for (const item of newLayout) {
    const widget = props.widgets.find((w) => w.id === item.i)
    if (!widget) continue
    // 逆向缩放：自定义列数 → 实际断点列数
    const bpCols = cols.value[currentBreakpoint.value] ?? 12
    const scale = bpCols / LIB_COLS.value
    emit('update-layout', item.i, {
      ...widget.layouts,
      [currentBreakpoint.value]: {
        x: Math.round(item.x * scale),
        y: item.y,
        w: Math.round(item.w * scale),
        h: item.h,
      },
    })
  }
}
</script>

<template>
  <div class="dashboard-grid">
    <GridLayout
      :layout="currentLayoutScaled"
      :col-num="lgCols"
      :row-height="80"
      :is-draggable="editing"
      :is-resizable="editing"
      :vertical-compact="true"
      :responsive="false"
      @layout-updated="handleLayoutUpdated"
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
