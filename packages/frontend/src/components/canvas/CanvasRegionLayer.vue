<script setup lang="ts">
import {
  worldToScreen,
  type CanvasRegion,
  type CanvasCamera,
  type Size,
  type SelectionRef,
} from '@nav/shared'
const props = defineProps<{
  regions: CanvasRegion[]
  camera: CanvasCamera
  size: Size
  editable: boolean
}>()
const emit = defineEmits<{
  start: [event: PointerEvent, mode: 'move' | 'resize', ref: SelectionRef]
}>()
const colors = {
  slate: '#94a3b8',
  blue: '#60a5fa',
  cyan: '#22d3ee',
  green: '#4ade80',
  amber: '#fbbf24',
  orange: '#fb923c',
  rose: '#fb7185',
  violet: '#a78bfa',
}
function style(r: CanvasRegion) {
  const p = worldToScreen(r, props.camera, props.size)
  return {
    left: p.x + 'px',
    top: p.y + 'px',
    width: r.w * props.camera.zoom + 'px',
    height: r.h * props.camera.zoom + 'px',
    color: colors[r.color],
    background: colors[r.color] + '12',
  }
}
</script>
<template>
  <div class="region-layer">
    <div v-for="r in regions" :key="r.id" class="region" :style="style(r)">
      <button
        class="region-title"
        :aria-label="`区域 ${r.title}`"
        @pointerdown="editable && emit('start', $event, 'move', { kind: 'region', id: r.id })"
      >
        {{ r.locked ? '🔒 ' : '' }}{{ r.title }}
      </button>
      <button
        v-if="editable && !r.locked"
        class="region-resize"
        :aria-label="`调整区域 ${r.title} 大小`"
        @pointerdown="emit('start', $event, 'resize', { kind: 'region', id: r.id })"
      >
        ↘
      </button>
      <div
        v-for="edge in ['top', 'bottom', 'left', 'right']"
        :key="edge"
        class="edge"
        :class="edge"
        @pointerdown="editable && emit('start', $event, 'move', { kind: 'region', id: r.id })"
      ></div>
    </div>
  </div>
</template>
<style scoped>
.region-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  overflow: hidden;
}
.region {
  position: absolute;
  border: 1px solid;
  box-sizing: border-box;
  pointer-events: none;
}
.region-title,
.region-resize {
  position: absolute;
  pointer-events: auto;
  touch-action: none;
  background: var(--bg-secondary);
  color: inherit;
  border: 1px solid currentColor;
  padding: 3px 7px;
  font-size: 12px;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  z-index: 2;
}
.region-title {
  top: 0;
  left: 0;
}
.region-resize {
  bottom: 0;
  right: 0;
}
.edge {
  position: absolute;
  pointer-events: auto;
  touch-action: none;
}
.top,
.bottom {
  left: 0;
  right: 0;
  height: 6px;
}
.top {
  top: -3px;
}
.bottom {
  bottom: -3px;
}
.left,
.right {
  top: 0;
  bottom: 0;
  width: 6px;
}
.left {
  left: -3px;
}
.right {
  right: -3px;
}
</style>
