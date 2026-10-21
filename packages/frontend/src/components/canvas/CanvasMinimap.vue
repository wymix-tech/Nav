<script setup lang="ts">
import { computed } from 'vue'
import { contentBounds, type Rect, type Point } from '@nav/shared'
const props = defineProps<{ rects: Rect[]; viewport: Rect }>()
const emit = defineEmits<{ navigate: [point: Point] }>()
const bounds = computed(() => {
  const b = contentBounds([...props.rects, props.viewport])!
  const pad = Math.max(b.w, b.h, 100) * 0.05
  return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }
})
function click(e: MouseEvent) {
  const svg = e.currentTarget as SVGSVGElement,
    matrix = svg.getScreenCTM()
  if (!matrix) return
  const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse())
  emit('navigate', { x: point.x, y: point.y })
}
</script>
<template>
  <svg
    class="canvas-minimap"
    :viewBox="`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    aria-label="画布小地图，点击定位；键盘可使用回到默认按钮"
    @click="click"
    @pointerdown.stop
    @wheel.stop
  >
    <rect
      v-for="(r, i) in rects"
      :key="i"
      :x="r.x"
      :y="r.y"
      :width="r.w"
      :height="r.h"
      fill="currentColor"
      opacity="0.4"
    />
    <rect
      :x="viewport.x"
      :y="viewport.y"
      :width="viewport.w"
      :height="viewport.h"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
<style scoped>
@layer nav-components {
  .canvas-minimap {
    display: block;
    width: 180px;
    height: 110px;
    max-width: 100%;
    background: var(--bg-secondary);
    border: 1px solid var(--glass-border);
    border-radius: 8px;
    cursor: crosshair;
  }
}
</style>
