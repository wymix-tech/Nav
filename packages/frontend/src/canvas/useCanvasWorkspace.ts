import { ref, onMounted, onUnmounted, nextTick, watch, type Ref } from 'vue'
import {
  normalizeSelection,
  selectionRect,
  effectiveLocked,
  resolveCanvasLabel,
  type Dashboard,
  type CanvasCamera,
  type CanvasCommand,
  type SelectionRef,
  type Rect,
  type WidgetInstance,
  type CanvasTypeNames,
} from '@nav/shared'
import { useDashboardStore } from '../stores/dashboardStore'
import type { CanvasTool, useCanvasInteraction } from './useCanvasInteraction'
interface Options {
  dashboard: () => Dashboard
  canEdit: Ref<boolean>
  root: Ref<HTMLElement | null>
  tool: Ref<CanvasTool>
  hand: Ref<boolean>
  selected: Ref<SelectionRef[]>
  additive: Ref<boolean>
  panel: Ref<'' | 'layers' | 'search' | 'views'>
  notice: Ref<string>
  highlight: Ref<string[]>
  camera: Ref<CanvasCamera>
  list: Ref<boolean>
  presentation: Ref<'list' | 'spatial'>
  names: Ref<CanvasTypeNames>
  ordered: Ref<WidgetInstance[]>
  interaction: ReturnType<typeof useCanvasInteraction>
  fit: (bounds: Rect | null) => void
  settleNavigation: () => void
  choose: (ref: SelectionRef, extend: boolean) => boolean
}
export function useCanvasWorkspace(o: Options) {
  const {
    dashboard,
    canEdit,
    root,
    tool,
    hand,
    selected,
    additive,
    panel,
    notice,
    highlight,
    camera,
    list,
    presentation,
    names,
    ordered,
    interaction,
    fit,
    settleNavigation,
    choose,
  } = o
  const store = useDashboardStore(),
    located = ref<SelectionRef | null>(null)
  async function commandAction(command: CanvasCommand, cancel = true) {
    if (cancel) interaction.cancel()
    if (!canEdit.value) return
    const ok = await store.applyCanvasCommand(command)
    notice.value = ok
      ? command.type === 'create-region' && command.bounded
        ? '区域已创建，边界已限制到世界范围；组件位置保持不变'
        : '操作已完成'
      : store.error
    if (ok) selected.value = normalizeSelection(dashboard(), selected.value)
  }
  function changeTool(value: CanvasTool) {
    settleNavigation()
    hand.value = false
    tool.value = value
  }
  function selectFromPanel(r: SelectionRef, extend: boolean) {
    interaction.cancel()
    if (canEdit.value) choose(r, extend || additive.value)
  }
  let previousNavigation: {
      camera: CanvasCamera
      presentation: 'list' | 'spatial'
      left: number
      top: number
    } | null = null,
    navigationSerial = 0,
    highlightTimer: ReturnType<typeof setTimeout> | undefined,
    trigger: HTMLElement | null = null
  function openPanel(value: typeof panel.value) {
    settleNavigation()
    trigger = document.activeElement as HTMLElement
    panel.value = panel.value === value ? '' : value
  }
  function closePanel() {
    panel.value = ''
    nextTick(() => trigger?.focus())
  }
  async function locate(r: SelectionRef) {
    const valid =
      r.kind === 'widget'
        ? dashboard().widgets.some((w) => w.id === r.id)
        : normalizeSelection(dashboard(), [r]).length > 0
    if (!valid) {
      notice.value = '目标已不存在'
      return
    }
    const ticket = ++navigationSerial
    settleNavigation()
    previousNavigation ??= {
      camera: { ...camera.value },
      presentation: presentation.value,
      left: root.value?.scrollLeft ?? 0,
      top: root.value?.scrollTop ?? 0,
    }
    let ids: string[] = []
    if (r.kind === 'widget') ids = [r.id]
    if (r.kind === 'group')
      ids = dashboard().canvasScene!.groups.find((g) => g.id === r.id)!.memberIds
    let navigationNote = ''
    if (list.value && r.kind !== 'region') {
      ids = ordered.value.filter((w) => ids.includes(w.id)).map((w) => w.id)
      await nextTick()
      if (ticket !== navigationSerial) return
      root.value
        ?.querySelector<HTMLElement>(`[data-widget-id="${ids[0]}"]`)
        ?.scrollIntoView({ block: 'center' })
    } else {
      if (list.value) presentation.value = 'spatial'
      await nextTick()
      if (ticket !== navigationSerial) return
      try {
        fit(selectionRect(dashboard(), r))
      } catch {
        notice.value = '目标已不存在'
        return
      }
      navigationNote = notice.value
    }
    highlight.value = ids
    located.value = r
    if (highlightTimer) clearTimeout(highlightTimer)
    highlightTimer = setTimeout(() => {
      highlight.value = []
      located.value = null
    }, 1500)
    notice.value = `已定位 ${resolveCanvasLabel(dashboard(), r, names.value)}${navigationNote ? '；' + navigationNote : ''}`
  }
  async function back() {
    const previous = previousNavigation
    if (!previous) return
    const ticket = ++navigationSerial
    previousNavigation = null
    settleNavigation()
    presentation.value = previous.presentation
    camera.value = previous.camera
    await nextTick()
    if (ticket !== navigationSerial || !root.value) return
    root.value.scrollLeft = previous.left
    root.value.scrollTop = previous.top
  }
  function namedNavigate(value: CanvasCamera) {
    navigationSerial++
    settleNavigation()
    presentation.value = 'spatial'
    camera.value = { ...value }
  }
  function shortcuts(e: KeyboardEvent) {
    const target = e.target as Element
    if (
      !root.value?.closest('.canvas-stage')?.contains(target) ||
      target.closest('input,textarea,select,[contenteditable],[role="dialog"],.widget-content')
    )
      return
    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      openPanel('search')
      return
    }
    if (!canEdit.value) return
    if (e.key === 'Escape') {
      if (panel.value) closePanel()
      else selected.value = []
      return
    }
    if (tool.value !== 'select') return
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      selected.value = [...(dashboard().canvasScene?.layers ?? [])]
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
      if (selected.value.some((r) => effectiveLocked(dashboard(), r))) return
      if (e.shiftKey && selected.value.length && selected.value.every((r) => r.kind === 'group')) {
        e.preventDefault()
        void commandAction({ type: 'ungroup', refs: selected.value })
      } else if (
        !e.shiftKey &&
        selected.value.length >= 2 &&
        selected.value.every((r) => r.kind === 'widget')
      ) {
        e.preventDefault()
        void commandAction({
          type: 'group',
          widgetIds: selected.value.map((r) => r.id),
          id: crypto.randomUUID(),
          title: '新分组',
        })
      }
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected.value.length) {
      e.preventDefault()
      void commandAction({ type: 'delete', refs: selected.value })
    }
  }

  onMounted(() => window.addEventListener('keydown', shortcuts))
  onUnmounted(() => {
    navigationSerial++
    window.removeEventListener('keydown', shortcuts)
    if (highlightTimer) clearTimeout(highlightTimer)
  })
  watch(
    [() => dashboard().id, () => dashboard().instanceId],
    () => {
      navigationSerial++
      previousNavigation = null
      located.value = null
      highlight.value = []
    },
    { flush: 'sync' },
  )
  return {
    commandAction,
    changeTool,
    selectFromPanel,
    openPanel,
    closePanel,
    locate,
    back,
    namedNavigate,
    located,
  }
}
