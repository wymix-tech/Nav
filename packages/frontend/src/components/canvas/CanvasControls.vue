<script setup lang="ts">
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
</script>
<template>
  <nav class="canvas-controls" aria-label="画布控制" @pointerdown.stop @wheel.stop>
    <button :aria-pressed="hand" :disabled="list" @click="emit('hand')">
      {{ hand ? '退出手形' : '手形工具' }}
    </button>
    <button :disabled="list" aria-label="缩小画布" @click="emit('zoom', 1 / 1.2)">−</button>
    <button :disabled="list" aria-label="恢复画布 100%" @click="emit('hundred')">
      {{ Math.round(zoom * 100) }}%
    </button>
    <button :disabled="list" aria-label="放大画布" @click="emit('zoom', 1.2)">+</button>
    <button :disabled="list" @click="emit('fit')">适应全部</button>
    <button :disabled="list" @click="emit('home')">回到默认</button>
    <button v-if="editable" :disabled="list" @click="emit('publish')">发布为默认视角</button>
    <button :aria-expanded="minimap" :disabled="list" @click="emit('minimap')">小地图</button>
    <button :aria-pressed="list" @click="emit('list')">{{ list ? '空间视图' : '列表视图' }}</button>
  </nav>
</template>
<style scoped>
.canvas-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  padding: 8px;
  background: var(--glass-bg);
  backdrop-filter: blur(16px);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
}
button {
  padding: 6px 8px;
  min-height: 32px;
  border-radius: 6px;
}
button[aria-pressed='true'] {
  background: var(--accent);
  color: white;
}
</style>
