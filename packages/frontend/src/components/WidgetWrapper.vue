<script setup lang="ts">
import { ref, computed } from 'vue'
import type { WidgetInstance } from '@nav/shared'
import { useWidgetStore } from '../stores/widgetStore'
import WidgetRenderer from './WidgetRenderer.vue'
import WidgetConfigForm from './WidgetConfigForm.vue'

const props = defineProps<{
  widget: WidgetInstance
  editing: boolean
  editable: boolean
}>()

const emit = defineEmits<{
  remove: []
  'update-config': [config: Record<string, any>]
}>()

const widgetStore = useWidgetStore()
const showConfig = ref(false)

const manifest = computed(() => {
  if (props.widget.source === 'installed') {
    return widgetStore.getWidget(props.widget.widgetId)?.manifest
  }
  return undefined
})

const widgetSchema = computed(() => {
  return manifest.value?.schema ?? null
})

function handleConfigUpdate(config: Record<string, any>) {
  emit('update-config', config)
}
</script>

<template>
  <div class="widget-wrapper" :class="{ editing }">
    <div v-if="editing && editable" class="widget-toolbar">
      <button
        v-if="widgetSchema"
        class="toolbar-btn config-btn"
        title="配置"
        @click="showConfig = true"
      >⚙</button>
      <button class="toolbar-btn remove-btn" title="删除" @click="emit('remove')">✕</button>
    </div>
    <div class="widget-content">
      <WidgetRenderer
        :widget="widget"
        :manifest="manifest"
        :editing="editing"
        :editable="editable"
        @update:config="(cfg) => emit('update-config', cfg)"
      />
    </div>

    <!-- 配置弹窗 -->
    <div v-if="showConfig" class="config-overlay" @click.self="showConfig = false">
      <div class="config-dialog">
        <h3>组件配置</h3>
        <WidgetConfigForm
          v-if="widgetSchema"
          :schema="widgetSchema"
          :model-value="widget.config"
          @update:model-value="handleConfigUpdate"
        />
        <div class="config-actions">
          <button @click="showConfig = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.widget-wrapper {
  height: 100%;
  background-color: var(--bg-card);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  position: relative;
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

/* 配置弹窗 */
.config-overlay {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  border-radius: var(--radius);
}

.config-dialog {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  width: 90%;
  max-width: 320px;
  max-height: 80%;
  overflow-y: auto;
}

.config-dialog h3 {
  font-size: 14px;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.config-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.config-actions button {
  padding: 6px 16px;
  font-size: 13px;
  background-color: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border);
}
</style>
