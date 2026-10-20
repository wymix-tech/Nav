<script setup lang="ts">
import { ref, onMounted, onUnmounted, useId } from 'vue'
import CanvasIcon from './CanvasIcon.vue'
import './canvasChrome.css'
defineProps<{ zoom: number; hand: boolean; list: boolean; editable: boolean; minimap: boolean }>()
const emit = defineEmits<{
  zoom: [factor: number]
  hundred: []
  fit: []
  home: []
  publish: []
  hand: []
  list: []
  minimap: []
}>()
const options = ref(false),
  root = ref<HTMLElement | null>(null),
  trigger = ref<HTMLButtonElement | null>(null),
  optionsId = useId()
function publish() {
  emit('publish')
  options.value = false
}
function outside(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) {
    options.value = false
  }
}
function escape(event: KeyboardEvent) {
  if (options.value) {
    event.stopPropagation()
    close()
  }
}
function close() {
  options.value = false
  trigger.value?.focus()
}
onMounted(() => document.addEventListener('pointerdown', outside, true))
onUnmounted(() => document.removeEventListener('pointerdown', outside, true))
</script>
<template>
  <nav
    ref="root"
    class="canvas-controls canvas-chrome"
    aria-label="画布控制"
    @pointerdown.stop
    @wheel.stop
    @keydown.esc="escape"
  >
    <button
      :aria-pressed="hand"
      :disabled="list"
      :aria-label="hand ? '退出手形' : '手形工具'"
      title="手形工具"
      @click="emit('hand')"
    >
      <CanvasIcon name="hand" />
    </button>
    <span class="divider" aria-hidden="true"></span>
    <button :disabled="list" aria-label="缩小画布" title="缩小画布" @click="emit('zoom', 1 / 1.2)">
      <CanvasIcon name="minus" />
    </button>
    <button
      class="zoom-value"
      :disabled="list"
      aria-label="恢复画布 100%"
      title="恢复画布 100%"
      @click="emit('hundred')"
    >
      {{ Math.round(zoom * 100) }}%
    </button>
    <button :disabled="list" aria-label="放大画布" title="放大画布" @click="emit('zoom', 1.2)">
      <CanvasIcon name="plus" />
    </button>
    <span class="divider" aria-hidden="true"></span>
    <button :disabled="list" aria-label="适应全部" title="适应全部" @click="emit('fit')">
      <CanvasIcon name="fit" />
    </button>
    <button :disabled="list" aria-label="回到默认" title="回到默认" @click="emit('home')">
      <CanvasIcon name="home" />
    </button>
    <button
      :aria-expanded="minimap"
      :disabled="list"
      aria-label="小地图"
      title="小地图"
      @click="emit('minimap')"
    >
      <CanvasIcon name="map" />
    </button>
    <button
      :aria-pressed="list"
      :aria-label="list ? '空间视图' : '列表视图'"
      :title="list ? '空间视图' : '列表视图'"
      @click="emit('list')"
    >
      <CanvasIcon :name="list ? 'region' : 'list'" />
    </button>
    <button
      ref="trigger"
      :aria-expanded="options"
      :aria-controls="optionsId"
      aria-label="更多画布选项"
      title="更多画布选项"
      @click="options = !options"
    >
      <CanvasIcon name="more" />
    </button>
    <div v-if="options" :id="optionsId" class="canvas-options canvas-chrome" aria-label="画布选项">
      <slot name="options" />
      <button v-if="editable" :disabled="list" @click="publish">发布为默认视角</button>
    </div>
  </nav>
</template>
<style scoped>
.canvas-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px;
  position: relative;
}
.canvas-controls > button {
  width: 36px;
  padding: 0;
  flex: none;
}
.canvas-controls > .zoom-value {
  width: 54px;
  font-variant-numeric: tabular-nums;
}
.divider {
  height: 18px;
  width: 1px;
  margin: 0 3px;
  background: var(--glass-border);
}
.canvas-options {
  position: absolute;
  bottom: calc(100% + 10px);
  right: 0;
  width: 260px;
  max-width: calc(100vw - 32px);
  padding: 14px;
  display: grid;
  gap: 12px;
  font-size: 12px;
}
@media (max-width: 600px) {
  .canvas-controls {
    padding: 4px;
    gap: 0;
  }
  .canvas-controls > button {
    width: 32px;
  }
  .canvas-controls > .zoom-value {
    width: 48px;
  }
  .divider {
    margin-inline: 2px;
  }
}
</style>
