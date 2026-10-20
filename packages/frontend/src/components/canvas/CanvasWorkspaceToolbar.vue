<script setup lang="ts">
import CanvasIcon from './CanvasIcon.vue'
import './canvasChrome.css'
defineProps<{
  panel: '' | 'layers' | 'search' | 'views'
  panelId: string
  spatial?: boolean
}>()
const emit = defineEmits<{ open: [panel: 'layers' | 'search' | 'views'] }>()
</script>

<template>
  <nav class="workspace-toolbar canvas-chrome" :class="{ spatial }" aria-label="内容导航">
    <span class="workspace-label">{{ spatial ? '画布' : '仪表盘' }}</span>
    <div class="workspace-actions">
      <button
        aria-label="图层"
        title="图层"
        :aria-expanded="panel === 'layers'"
        :aria-controls="panelId"
        @click="emit('open', 'layers')"
      >
        <CanvasIcon name="layers" /><span>图层</span>
      </button>
      <button
        aria-label="搜索画布"
        title="搜索画布"
        :aria-expanded="panel === 'search'"
        :aria-controls="panelId"
        @click="emit('open', 'search')"
      >
        <CanvasIcon name="search" /><span>搜索画布</span>
      </button>
      <button
        v-if="spatial"
        aria-label="我的视角"
        title="我的视角"
        :aria-expanded="panel === 'views'"
        :aria-controls="panelId"
        @click="emit('open', 'views')"
      >
        <CanvasIcon name="views" /><span>我的视角</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.workspace-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px;
}
.workspace-label {
  margin-inline: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.workspace-actions {
  display: flex;
  gap: 2px;
}
.spatial .workspace-label {
  display: none;
}
@media (max-width: 480px) {
  .spatial button {
    width: 36px;
    padding: 0;
  }
  .spatial button span {
    display: none;
  }
}
</style>
