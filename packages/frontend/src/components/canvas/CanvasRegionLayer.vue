<script setup lang="ts">
import { computed } from 'vue'
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
const visible = computed(() =>
  props.regions.filter((r) => {
    const p = worldToScreen(r, props.camera, props.size)
    return (
      p.x < props.size.width &&
      p.x + r.w * props.camera.zoom > 0 &&
      p.y < props.size.height &&
      p.y + r.h * props.camera.zoom > 0
    )
  }),
)
function cornerVisible(r: CanvasRegion, end = false) {
  const p = worldToScreen(
    { x: r.x + (end ? r.w : 0), y: r.y + (end ? r.h : 0) },
    props.camera,
    props.size,
  )
  return p.x >= 0 && p.y >= 0 && p.x <= props.size.width && p.y <= props.size.height
}
function edgeVisible(r: CanvasRegion, edge: string) {
  const p = worldToScreen(r, props.camera, props.size)
  const coordinate =
    edge === 'left'
      ? p.x
      : edge === 'right'
        ? p.x + r.w * props.camera.zoom
        : edge === 'top'
          ? p.y
          : p.y + r.h * props.camera.zoom
  return (
    coordinate >= -3 &&
    coordinate <= (edge === 'left' || edge === 'right' ? props.size.width : props.size.height) + 3
  )
}
function style(r: CanvasRegion) {
  const p = worldToScreen(r, props.camera, props.size)
  const right = p.x + r.w * props.camera.zoom,
    bottom = p.y + r.h * props.camera.zoom
  const left = Math.max(-3, p.x),
    top = Math.max(-3, p.y)
  return {
    left: left + 'px',
    top: top + 'px',
    width: Math.min(props.size.width + 3, right) - left + 'px',
    height: Math.min(props.size.height + 3, bottom) - top + 'px',
    borderLeftColor: p.x < -3 ? 'transparent' : undefined,
    borderTopColor: p.y < -3 ? 'transparent' : undefined,
    borderRightColor: right > props.size.width + 3 ? 'transparent' : undefined,
    borderBottomColor: bottom > props.size.height + 3 ? 'transparent' : undefined,
    color: colors[r.color],
    background: colors[r.color] + '12',
  }
}
</script>
<template>
  <div class="region-layer">
    <div v-for="r in visible" :key="r.id" class="region" :style="style(r)">
      <button
        v-if="cornerVisible(r)"
        class="region-title"
        :aria-label="`区域 ${r.title}`"
        @pointerdown="editable && emit('start', $event, 'move', { kind: 'region', id: r.id })"
      >
        {{ r.locked ? '🔒 ' : '' }}{{ r.title }}
      </button>
      <button
        v-if="editable && !r.locked && cornerVisible(r, true)"
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
        :style="{
          pointerEvents: edgeVisible(r, edge) ? undefined : 'none',
        }"
        @pointerdown="editable && emit('start', $event, 'move', { kind: 'region', id: r.id })"
      ></div>
    </div>
  </div>
</template>
<style scoped>
@layer nav-components {
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
}
</style>
