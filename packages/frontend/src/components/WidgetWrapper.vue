<script setup lang="ts">
import CanvasIcon from './canvas/CanvasIcon.vue'
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRuntimeContext } from '../runtime/useRuntimeReconciler'
import type { DisplayLevel } from '../canvas/visibilityPolicy'
import CanvasWidgetSummary from './canvas/CanvasWidgetSummary.vue'
import ModalShell from './ModalShell.vue'
import {
  resolveWidgetAppearance,
  widgetAppearanceOptions,
  type WidgetAppearance,
  type WidgetInstance,
} from '@nav/shared'
import { useDashboardStore } from '../stores/dashboardStore'
import { useWidgetStore } from '../stores/widgetStore'
import WidgetRenderer from './WidgetRenderer.vue'
import WidgetConfigForm from './WidgetConfigForm.vue'

const props = withDefaults(
  defineProps<{
    widget: WidgetInstance
    editing: boolean
    editable: boolean
    canDelete?: boolean
    mounted?: boolean
    active?: boolean
    level?: DisplayLevel
    label?: string
  }>(),
  { canDelete: true, mounted: true, active: true, level: 'full', label: '' },
)

const emit = defineEmits<{
  activate: []
  remove: []
  'update-config': [config: Record<string, any>]
}>()

const widgetStore = useWidgetStore()
const showConfig = ref(false)
const showAppearance = ref(false)
const appearanceDraft = ref<WidgetAppearance | ''>('')
const savingAppearance = ref(false)
const dashboardStore = useDashboardStore()
const appearance = computed(() =>
  resolveWidgetAppearance(props.widget, dashboardStore.dashboard?.widgetAppearance),
)
function openAppearance() {
  appearanceDraft.value = props.widget.appearance ?? ''
  showAppearance.value = true
}
async function saveAppearance() {
  if (!props.editable || savingAppearance.value) return
  savingAppearance.value = true
  try {
    if (
      await dashboardStore.updateWidgetAppearance(
        props.widget.id,
        appearanceDraft.value || undefined,
      )
    )
      showAppearance.value = false
  } finally {
    savingAppearance.value = false
  }
}
const runtime = useRuntimeContext()
let release: (() => void) | undefined
watch(
  () => showConfig.value || showAppearance.value,
  (open) => {
    release?.()
    release = open ? runtime.activity.pin(props.widget.id, 'wrapper-config') : undefined
  },
  { flush: 'sync' },
)
onUnmounted(() => release?.())
watch(
  () => props.editable,
  (allowed) => {
    if (!allowed) {
      showAppearance.value = false
      if (!runtime.hasSession()) showConfig.value = false
    }
  },
)

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
  <div
    class="widget-wrapper"
    :class="{ editing }"
    :data-appearance="appearance"
    :data-widget-type="widget.widgetId"
    :data-summary="!active || !mounted"
  >
    <div v-if="editing && editable" class="widget-toolbar">
      <button
        v-if="widget.source === 'builtin'"
        class="toolbar-btn appearance-btn"
        aria-label="组件外观"
        title="组件外观"
        @click="openAppearance"
      >
        <CanvasIcon name="appearance" />
      </button>
      <button
        v-if="widgetSchema"
        class="toolbar-btn config-btn"
        title="配置"
        aria-label="配置"
        @click="showConfig = true"
      >
        <CanvasIcon name="settings" />
      </button>
      <button
        :disabled="canDelete === false"
        :title="canDelete === false ? '布局锁定或属于分组，请先解锁／解组' : '删除'"
        class="toolbar-btn remove-btn"
        aria-label="删除组件"
        @click="emit('remove')"
      >
        <CanvasIcon name="close" />
      </button>
    </div>
    <div
      v-show="(active && mounted) || showConfig"
      class="widget-content"
      :inert="!active && !showConfig ? true : undefined"
    >
      <WidgetRenderer
        v-if="mounted || showConfig"
        :widget="widget"
        :manifest="manifest"
        :resource-active="active"
        :editing="editing"
        :editable="editable"
        @update:config="(cfg) => emit('update-config', cfg)"
      />
    </div>

    <button
      v-if="!active || !mounted"
      class="widget-summary"
      :class="level"
      :aria-label="`进入组件 ${label || widget.widgetId}`"
      @click="emit('activate')"
    >
      <CanvasWidgetSummary :widget="widget" :label="label" :level="level" :editable="editable" />
    </button>
    <ModalShell v-if="showAppearance" label="组件外观" @close="showAppearance = false">
      <div class="appearance-dialog">
        <h3>组件外观</h3>
        <label :for="`appearance-${widget.id}`">外观模式</label>
        <select
          :id="`appearance-${widget.id}`"
          v-model="appearanceDraft"
          :disabled="savingAppearance"
        >
          <option value="">跟随全局设置</option>
          <option
            v-for="option in widgetAppearanceOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
        <p class="appearance-hint">
          自动模式为时钟、天气、搜索和书签使用玻璃，为聊天和监控数据使用实色背景。
        </p>
        <p v-if="dashboardStore.error" role="alert">{{ dashboardStore.error }}</p>
        <div class="config-actions">
          <button :disabled="savingAppearance" @click="showAppearance = false">取消</button>
          <button class="primary" :disabled="savingAppearance" @click="saveAppearance">
            {{ savingAppearance ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </ModalShell>
    <!-- 配置弹窗 -->
    <ModalShell v-if="showConfig" label="组件配置" @close="showConfig = false">
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
    </ModalShell>
  </div>
</template>

<style scoped>
@layer nav-components {
  .widget-summary {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: calc(4px * var(--canvas-inverse, 1));
    font-size: calc(12px * var(--canvas-inverse, 1));
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--glass-border);
    border-radius: inherit;
  }
  .widget-summary :deep(strong),
  .widget-summary :deep(small),
  .widget-summary :deep(span) {
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .widget-summary.outline :deep(strong),
  .widget-summary.outline :deep(small),
  .widget-summary.outline :deep(span) {
    display: none;
  }

  .widget-wrapper {
    height: 100%;
    background: transparent;
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    position: relative;
    transition: background 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    animation: fadeInUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) both;
  }

  .editing.widget-wrapper:hover {
    background: rgba(255, 255, 255, 0.03);
    border-color: rgba(96, 165, 250, 0.15);
  }

  .widget-wrapper.editing {
    background: rgba(255, 255, 255, 0.01);
    border: 1px solid rgba(96, 165, 250, 0.08);
  }

  .widget-toolbar {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 10;
    display: flex;
    justify-content: flex-end;
    gap: 4px;
    padding: 6px 10px;
  }

  .toolbar-btn {
    width: 32px;
    height: 32px;
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

  .widget-wrapper:hover .toolbar-btn,
  .widget-wrapper:focus-within .toolbar-btn {
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
    min-height: 0;
    overflow: auto;
    border-radius: inherit;
  }

  @media (max-width: 480px) {
    .widget-content {
      padding: 10px;
    }

    .widget-toolbar {
      padding: 4px 6px;
    }
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
  @media (hover: none) {
    .toolbar-btn {
      opacity: 1;
      transform: none;
    }
  }
}
</style>
