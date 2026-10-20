<script setup lang="ts">
import { computed } from 'vue'
import {
  worldToScreen,
  type Rect,
  type CanvasCamera,
  type Size,
  type SelectionRef,
  type Guide,
} from '@nav/shared'
const props = defineProps<{
  boxes: { ref: SelectionRef; rect: Rect }[]
  marquee: Rect | null
  preview: Rect | null
  camera: CanvasCamera
  size: Size
  guides: Guide[]
}>()
const style = (r: Rect) => {
  const p = worldToScreen(r, props.camera, props.size)
  return {
    left: p.x + 'px',
    top: p.y + 'px',
    width: r.w * props.camera.zoom + 'px',
    height: r.h * props.camera.zoom + 'px',
  }
}
const lines = computed(() =>
  props.guides.map((g) => {
    const a = worldToScreen(
        g.axis === 'x' ? { x: g.value, y: g.from } : { x: g.from, y: g.value },
        props.camera,
        props.size,
      ),
      b = worldToScreen(
        g.axis === 'x' ? { x: g.value, y: g.to } : { x: g.to, y: g.value },
        props.camera,
        props.size,
      )
    return {
      ...g,
      style: {
        left: a.x + 'px',
        top: a.y + 'px',
        width: Math.max(1, b.x - a.x) + 'px',
        height: Math.max(1, b.y - a.y) + 'px',
      },
    }
  }),
)
</script>
<template>
  <div class="selection-overlay" aria-hidden="true">
    <div
      v-for="b in boxes"
      :key="b.ref.kind + b.ref.id"
      class="selection-box"
      :style="style(b.rect)"
    ></div>
    <div v-if="marquee" class="marquee" :style="style(marquee)"></div>
    <div v-if="preview" class="region-preview" :style="style(preview)"></div>
    <div v-for="g in lines" :key="g.axis + g.id" class="guide" :style="g.style"></div>
  </div>
</template>
<style scoped>
.selection-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 15;
  overflow: hidden;
}
.selection-box,
.marquee,
.region-preview {
  position: absolute;
  box-sizing: border-box;
  border: 2px solid var(--accent);
}
.marquee {
  background: #60a5fa22;
  border-width: 1px;
}
.region-preview {
  background: #60a5fa11;
  border-style: dashed;
}
.guide {
  position: absolute;
  background: #e879f9;
}
</style>
