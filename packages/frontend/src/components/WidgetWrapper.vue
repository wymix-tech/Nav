<script setup lang="ts">
import type { WidgetInstance } from '@nav/shared'

defineProps<{
  widget: WidgetInstance
  editing: boolean
  editable: boolean
}>()

defineEmits<{
  remove: []
  'update-config': [config: Record<string, any>]
}>()
</script>

<template>
  <div class="widget-stub">{{ widget.widgetId }}</div>
</template>

<style scoped>
.widget-stub {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 14px;
}
</style>
