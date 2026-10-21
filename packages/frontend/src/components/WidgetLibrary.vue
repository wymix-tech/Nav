<script setup lang="ts">
import { builtinWidgets } from '../canvas/useCanvasLabels'
import { useWidgetStore } from '../stores/widgetStore'
import { onUnmounted, ref } from 'vue'
import type { AddWidgetRequest } from '../canvas/useCanvasInsertion'

const widgetStore = useWidgetStore()

const emit = defineEmits<{
  'request-add-widget': [request: AddWidgetRequest]
  'show-install': []
  'toggle-library': []
}>()

const props = defineProps<{
  visible: boolean
  spatial: boolean
  top?: number
}>()

function addToDashboard(widgetId: string, source: 'builtin' | 'installed', keyboard = false) {
  if (suppress && !keyboard) {
    suppress = false
    return
  }
  emit('request-add-widget', { widgetId, source })
}
const ghost = ref<{ x: number; y: number } | null>(null)
let drag: {
  id: number
  x: number
  y: number
  widgetId: string
  source: 'builtin' | 'installed'
  moved: boolean
  target: HTMLElement
} | null = null
let suppress = false
function start(e: PointerEvent, widgetId: string, source: 'builtin' | 'installed') {
  suppress = false
  if (
    !props.spatial ||
    e.button !== 0 ||
    e.pointerType === 'touch' ||
    (e.target as Element).closest('button')
  )
    return
  drag = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    widgetId,
    source,
    moved: false,
    target: e.currentTarget as HTMLElement,
  }
  drag.target.setPointerCapture(e.pointerId)
  e.preventDefault()
  document.addEventListener('pointermove', move)
  document.addEventListener('pointerup', finish)
  document.addEventListener('pointercancel', cancel)
  document.addEventListener('keydown', escape)
  window.addEventListener('blur', cancel)
}
function move(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return
  if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true
  if (drag.moved) {
    e.preventDefault()
    ghost.value = { x: e.clientX, y: e.clientY }
  }
}
function cancel() {
  const previous = drag
  suppress = !!drag?.moved
  drag = null
  if (previous?.target.hasPointerCapture(previous.id))
    previous.target.releasePointerCapture(previous.id)
  ghost.value = null
  document.removeEventListener('pointermove', move)
  document.removeEventListener('pointerup', finish)
  document.removeEventListener('pointercancel', cancel)
  document.removeEventListener('keydown', escape)
  window.removeEventListener('blur', cancel)
}
function escape(e: KeyboardEvent) {
  if (e.key === 'Escape') cancel()
}
function finish(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return
  const d = drag
  cancel()
  if (d.moved && props.visible)
    emit('request-add-widget', {
      widgetId: d.widgetId,
      source: d.source,
      client: { x: e.clientX, y: e.clientY },
    })
}
onUnmounted(cancel)

async function uninstall(id: string) {
  try {
    await widgetStore.uninstall(id)
    widgetStore.error = ''
  } catch (e) {
    widgetStore.error = (e as Error).message
  }
}
</script>

<template>
  <div
    class="library-wrapper"
    :class="{ visible, spatial }"
    :style="{ '--canvas-library-top': (top ?? 24) + 'px' }"
  >
    <div class="library-panel">
      <div class="library-header">
        <h3>组件库</h3>
        <div class="header-actions">
          <button class="install-btn" @click="emit('show-install')">安装组件</button>
          <button class="collapse-btn" @click="emit('toggle-library')" title="收起">✕</button>
        </div>
      </div>

      <div class="section">
        <h4>内置组件</h4>
        <div class="widget-list">
          <div
            v-for="w in builtinWidgets"
            :key="w.id"
            class="widget-item"
            role="button"
            tabindex="0"
            @pointerdown="start($event, w.id, 'builtin')"
            @keydown.enter.self="addToDashboard(w.id, 'builtin', true)"
            @click="addToDashboard(w.id, 'builtin')"
          >
            <span class="widget-icon">{{ w.icon }}</span>
            <span class="widget-name">{{ w.name }}</span>
          </div>
        </div>
      </div>

      <div v-if="widgetStore.installedWidgets.length > 0" class="section">
        <h4>已安装组件</h4>
        <p v-if="widgetStore.error" role="alert">{{ widgetStore.error }}</p>
        <div class="widget-list">
          <div
            v-for="w in widgetStore.installedWidgets"
            :key="w.widgetId"
            class="widget-item"
            role="button"
            tabindex="0"
            @pointerdown="start($event, w.widgetId, 'installed')"
            @keydown.enter.self="addToDashboard(w.widgetId, 'installed', true)"
            @click="addToDashboard(w.widgetId, 'installed')"
          >
            <span class="widget-icon">{{ w.manifest.icon }}</span>
            <span class="widget-name">{{ w.manifest.displayName }}</span
            ><button @click.stop="uninstall(w.widgetId)">卸载</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <Teleport to="body"
    ><div
      v-if="ghost"
      class="insertion-ghost"
      :style="{ left: ghost.x + 'px', top: ghost.y + 'px' }"
    >
      ＋ 释放以添加组件
    </div></Teleport
  >
</template>

<style scoped>
@layer nav-components {
  .library-wrapper {
    position: fixed;
    left: 12px;
    top: var(--canvas-library-top, 24px);
    bottom: 88px;
    z-index: 90;
    transform: translateY(20px);
    opacity: 0;
    pointer-events: none;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .library-wrapper.visible {
    transform: translateY(0);
    opacity: 1;
    pointer-events: all;
  }

  .library-panel {
    width: 260px;
    max-height: calc(100dvh - 120px);
    overflow-y: auto;
    background: var(--glass-bg);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    padding: 20px;
    box-shadow: var(--shadow-lg);
  }

  .library-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 18px;
  }

  .library-header h3 {
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .header-actions {
    display: flex;
    gap: 6px;
  }

  .install-btn {
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 500;
    background: linear-gradient(135deg, var(--accent), var(--accent-hover));
    color: white;
    border-radius: 10px;
    box-shadow: 0 2px 8px rgba(96, 165, 250, 0.25);
  }

  .install-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(96, 165, 250, 0.35);
  }

  .collapse-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-secondary);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
  }

  .collapse-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-primary);
  }

  .section {
    margin-bottom: 16px;
  }

  .section:last-child {
    margin-bottom: 0;
  }

  .section h4 {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--text-muted);
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-weight: 600;
  }

  .widget-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .widget-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--text-primary);
    transition: all 0.2s;
  }

  .widget-item:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.12);
    transform: translateY(-1px);
  }

  .widget-item:active {
    transform: translateY(0);
  }

  .widget-icon {
    font-size: 16px;
  }

  /* 手机端：底部抽屉 */
  @media (max-width: 1099px) {
    .library-wrapper {
      left: 0;
      right: 0;
      bottom: 0;
      top: auto;
      transform: translateY(100%);
    }

    .library-wrapper.visible {
      transform: translateY(0);
    }

    .library-panel {
      width: 100%;
      border-radius: var(--radius-xl) var(--radius-xl) 0 0;
      max-height: 50vh;
      overflow-y: auto;
    }
  }
}
</style>

<style scoped>
@layer nav-components {
  .insertion-ghost {
    position: fixed;
    z-index: 500;
    pointer-events: none;
    transform: translate(-50%, -50%);
    padding: 20px;
    background: var(--bg-secondary);
    border: 2px solid var(--accent);
    border-radius: 12px;
  }
  @media (max-width: 1099px) {
    .library-wrapper.spatial {
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      height: 220px;
    }
    .spatial .library-panel {
      width: 100%;
      height: 220px;
      max-height: 220px;
      border-radius: 12px 12px 0 0;
      padding: 12px;
    }
  }
}
</style>

<style scoped>
@layer nav-components {
  @media (min-width: 1100px) {
    .library-wrapper.spatial {
      top: var(--canvas-library-top, 24px);
    }
    .spatial .library-panel {
      max-height: 100%;
    }
  }
}
</style>
