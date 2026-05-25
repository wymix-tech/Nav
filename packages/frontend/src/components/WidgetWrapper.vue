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
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  position: relative;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.03),
    0 4px 24px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  transition: box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  animation: fadeInUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) both;
}

.widget-wrapper:hover {
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.06),
    0 8px 40px rgba(0, 0, 0, 0.3),
    0 0 60px -20px var(--accent-glow);
  transform: translateY(-1px);
}

.widget-wrapper.editing {
  border: 1px solid rgba(96, 165, 250, 0.15);
  box-shadow:
    0 0 0 1px rgba(96, 165, 250, 0.05),
    0 4px 24px rgba(0, 0, 0, 0.2);
}

.widget-wrapper.editing:hover {
  border-color: rgba(96, 165, 250, 0.3);
  box-shadow:
    0 0 0 1px rgba(96, 165, 250, 0.1),
    0 0 30px rgba(96, 165, 250, 0.05),
    0 8px 40px rgba(0, 0, 0, 0.3);
}

.widget-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  padding: 6px 10px;
}

.toolbar-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  padding: 0;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.widget-wrapper:hover .toolbar-btn {
  opacity: 1;
  transform: scale(1);
}

.toolbar-btn:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.15);
}

.remove-btn:hover {
  color: var(--danger);
  background: rgba(248, 113, 113, 0.12);
  border-color: rgba(248, 113, 113, 0.2);
}

.widget-content {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

/* 配置弹窗 */
.config-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  border-radius: var(--radius-md);
}

.config-dialog {
  background: var(--glass-bg);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: 20px;
  width: 90%;
  max-width: 320px;
  max-height: 80%;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}

.config-dialog h3 {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 14px;
  color: var(--text-primary);
}

.config-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.config-actions button {
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  transition: all 0.2s;
}

.config-actions button:hover {
  background: rgba(255, 255, 255, 0.1);
}
</style>
