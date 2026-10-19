<script setup lang="ts">
defineProps<{
  panel: '' | 'layers' | 'search' | 'views'
  panelId: string
  spatial?: boolean
}>()
const emit = defineEmits<{ open: [panel: 'layers' | 'search' | 'views'] }>()
</script>

<template>
  <nav class="workspace-toolbar" aria-label="内容导航">
    <span class="workspace-label">{{ spatial ? '画布' : '仪表盘' }}</span>
    <div class="workspace-actions">
      <button
        :aria-expanded="panel === 'layers'"
        :aria-controls="panelId"
        @click="emit('open', 'layers')"
      >
        图层
      </button>
      <button
        :aria-expanded="panel === 'search'"
        :aria-controls="panelId"
        @click="emit('open', 'search')"
      >
        搜索画布
      </button>
      <button
        v-if="spatial"
        :aria-expanded="panel === 'views'"
        :aria-controls="panelId"
        @click="emit('open', 'views')"
      >
        我的视角
      </button>
    </div>
  </nav>
</template>

<style scoped>
.workspace-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  background: var(--bg-primary);
  color: var(--text-primary);
}
.workspace-label {
  font-size: 12px;
  color: var(--text-muted);
}
.workspace-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
button {
  min-height: 36px;
  padding: 6px 12px;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
  white-space: nowrap;
}
button:hover,
button[aria-expanded='true'] {
  border-color: var(--accent);
  color: var(--accent);
}
@media (max-width: 480px) {
  .workspace-toolbar {
    padding: 6px 8px;
  }
  button {
    padding-inline: 9px;
  }
}
</style>
