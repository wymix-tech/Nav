<script setup lang="ts">
import type { WidgetInstance } from '@nav/shared'
import WidgetRenderer from './WidgetRenderer.vue'

defineProps<{
  widget: WidgetInstance
  editing: boolean
  editable: boolean
}>()

const emit = defineEmits<{
  remove: []
  'update-config': [config: Record<string, any>]
}>()
</script>

<template>
  <div class="widget-wrapper" :class="{ editing }">
    <div v-if="editing && editable" class="widget-toolbar">
      <button class="toolbar-btn config-btn" title="配置">⚙</button>
      <button class="toolbar-btn remove-btn" title="删除" @click="emit('remove')">✕</button>
    </div>
    <div class="widget-content">
      <WidgetRenderer
        :widget="widget"
        :editing="editing"
        :editable="editable"
        @update:config="(cfg) => emit('update-config', cfg)"
      />
    </div>
  </div>
</template>

<style scoped>
.widget-wrapper {
  height: 100%;
  background-color: var(--bg-card);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.widget-wrapper.editing {
  border-color: var(--accent);
  border-style: dashed;
}

.widget-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  padding: 4px 8px;
  background-color: rgba(0, 0, 0, 0.2);
}

.toolbar-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  padding: 0;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid transparent;
  border-radius: 4px;
}

.toolbar-btn:hover {
  color: var(--text-primary);
  background-color: rgba(255, 255, 255, 0.1);
}

.remove-btn:hover {
  color: #ef4444;
}

.widget-content {
  flex: 1;
  overflow: auto;
  padding: 12px;
}
</style>
