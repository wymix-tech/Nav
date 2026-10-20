import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  validateCurrentDashboard,
  validateCanvasTransition,
  applyCanvasCommand as executeCanvasCommand,
  canonical,
  groupFor,
  type CanvasCommand,
  profileKey,
  type Dashboard,
  type CanvasLayout,
  type CanvasCamera,
  validCamera,
  type WidgetInstance,
  type LayoutMap,
  type SyncState,
  type RecoveryPreview,
} from '@nav/shared'
import { getStorageAdapter, localMode } from '../services/storageAdapter'
import { useAuthStore } from './authStore'
import { clone, localDatabase } from '../services/localDatabase'
import { sameDashboardContent, type StorageNotice } from '../services/storageEvents'
export const useDashboardStore = defineStore('dashboard', () => {
  const dashboard = ref<Dashboard | null>(null),
    loading = ref(true),
    error = ref('')
  const syncState = ref<SyncState>({ lastSyncAt: null, pendingChanges: 0, status: 'local-only' })
  const history = ref<Dashboard[]>([]),
    future = ref<Dashboard[]>([])
  let writes = 0,
    queue = Promise.resolve(),
    unsaved = false
  const recoveryPreview = ref<RecoveryPreview | null>(null)
  async function refreshStatus() {
    const adapter = await getStorageAdapter()
    syncState.value = await adapter.getSyncState()
    recoveryPreview.value = (await adapter.getRecoveryPreview?.()) ?? null
  }
  let isEditing = false
  window.addEventListener('nav-editing-changed', (e) => {
    isEditing = !!(e as CustomEvent).detail
  })
  async function load() {
    if (unsaved && dashboard.value)
      await localDatabase.backups.put({
        key: 'unsaved:' + Date.now(),
        data: JSON.stringify(dashboard.value),
      })
    loading.value = true
    error.value = ''
    try {
      dashboard.value = await (await getStorageAdapter()).getDashboard()
      history.value = []
      future.value = []
      unsaved = false
      window.dispatchEvent(new CustomEvent('nav-unsaved-changed', { detail: false }))
      await refreshStatus()
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载失败'
    } finally {
      loading.value = false
    }
  }
  function editable() {
    return localMode || useAuthStore().isAuthenticated
  }
  async function persist(d: Dashboard): Promise<boolean> {
    writes++
    const operation = queue
      .catch(() => {})
      .then(async () => {
        await (await getStorageAdapter()).saveDashboard(d)
      })
    queue = operation
    try {
      await operation
      unsaved = false
      window.dispatchEvent(new CustomEvent('nav-unsaved-changed', { detail: false }))
      error.value = ''
      await refreshStatus()
      return true
    } catch (e) {
      unsaved = true
      window.dispatchEvent(new CustomEvent('nav-unsaved-changed', { detail: true }))
      error.value = e instanceof Error ? e.message : '保存失败'
      return false
    } finally {
      writes--
    }
  }
  async function replaceDocument(next: Dashboard, updateHistory: () => void): Promise<boolean> {
    if (!editable()) {
      error.value = '请先登录再编辑'
      return false
    }
    try {
      validateCurrentDashboard(next)
      if (dashboard.value) validateCanvasTransition(dashboard.value, next)
      if (dashboard.value && canonical(dashboard.value) === canonical(next)) return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : '配置无效'
      return false
    }
    const snapshot = clone(next)
    // No await between the document and stack changes. Delayed persistence
    // must never mutate history after a later command has already run.
    updateHistory()
    dashboard.value = snapshot
    return persist(clone(next))
  }
  function commit(next: Dashboard, remember = true): Promise<boolean> {
    return replaceDocument(next, () => {
      if (remember && dashboard.value) {
        history.value.push(clone(dashboard.value))
        if (history.value.length > 50) history.value.shift()
        future.value = []
      }
    })
  }
  function mutate(fn: (d: Dashboard) => void) {
    if (!dashboard.value) return Promise.resolve(false)
    const next = clone(dashboard.value)
    fn(next)
    return commit(next)
  }
  async function save() {
    if (dashboard.value) return persist(clone(dashboard.value))
    return false
  }
  function applyCanvasCommand(command: CanvasCommand) {
    if (!dashboard.value) return Promise.resolve(false)
    try {
      return commit(executeCanvasCommand(dashboard.value, command))
    } catch (e) {
      error.value = e instanceof Error ? e.message : '操作失败'
      return Promise.resolve(false)
    }
  }
  function addWidget(w: WidgetInstance) {
    return applyCanvasCommand({ type: 'add-widget', widget: w })
  }
  function removeWidget(id: string) {
    if (dashboard.value && groupFor(dashboard.value, id)) {
      error.value = '请先解组再单独删除组件'
      return Promise.resolve(false)
    }
    return applyCanvasCommand({ type: 'delete', refs: [{ kind: 'widget', id }] })
  }
  function clearAllWidgets() {
    return applyCanvasCommand({ type: 'clear' })
  }
  function updateWidgetConfig(id: string, config: Record<string, any>) {
    return mutate((d) => {
      const w = d.widgets.find((w) => w.id === id)
      if (w) w.config = clone(config)
    })
  }
  function updateWidgetLayouts(id: string, layouts: WidgetInstance['layouts']) {
    return mutate((d) => {
      const w = d.widgets.find((w) => w.id === id)
      if (w) w.layouts = clone(layouts)
    })
  }
  function updateLayouts(layout: LayoutMap, cols: number) {
    return mutate((d) => {
      if (cols === (d.baseColumns ?? d.columns)) {
        for (const w of d.widgets) if (layout[w.id]) w.layouts.lg = layout[w.id]
        delete d.layoutProfiles?.[profileKey(cols)]
      } else {
        d.layoutProfiles ??= {}
        d.layoutProfiles[profileKey(cols)] = clone(layout)
      }
    })
  }
  function updateCanvas(id: string, canvas: CanvasLayout) {
    return applyCanvasCommand({ type: 'geometry', widgets: { [id]: canvas } })
  }
  function setDefaultCamera(camera: CanvasCamera) {
    if (!validCamera(camera)) return Promise.resolve(false)
    return mutate((d) => {
      d.canvasSettings = { version: 1, defaultCamera: clone(camera) }
    })
  }
  function resetProfile(cols: number) {
    return mutate((d) => {
      delete d.layoutProfiles?.[profileKey(cols)]
    })
  }
  function setBase(layout: LayoutMap, cols: number) {
    return mutate((d) => {
      d.layoutProfiles ??= {}
      d.layoutProfiles[profileKey(d.baseColumns ?? d.columns)] = Object.fromEntries(
        d.widgets.map((w) => [w.id, clone(w.layouts.lg)]),
      )
      d.baseColumns = cols
      for (const w of d.widgets) if (layout[w.id]) w.layouts.lg = clone(layout[w.id])
      delete d.layoutProfiles[profileKey(cols)]
    })
  }
  async function undo() {
    if (!history.value.length || !dashboard.value || !editable()) return
    const before = dashboard.value,
      target = history.value.at(-1)!
    return replaceDocument({ ...target, revision: before.revision }, () => {
      history.value.pop()
      future.value.push(clone(before))
    })
  }
  async function redo() {
    if (!future.value.length || !dashboard.value || !editable()) return
    const before = dashboard.value,
      target = future.value.at(-1)!
    return replaceDocument({ ...target, revision: before.revision }, () => {
      future.value.pop()
      history.value.push(clone(before))
    })
  }
  async function retry() {
    if (unsaved && dashboard.value) await persist(clone(dashboard.value))
    const a = await getStorageAdapter()
    await a.push([])
    await refreshStatus()
  }
  async function resolveConflict(local: boolean) {
    const a = await getStorageAdapter()
    if (a.resolveConflict) {
      try {
        await a.resolveConflict(local)
        history.value = []
        future.value = []
        await load()
      } catch (e) {
        error.value = e instanceof Error ? e.message : '恢复失败'
        await refreshStatus()
      }
    }
  }
  async function exportData() {
    const backups = await localDatabase.backups.toArray()
    const text = JSON.stringify(
      { dashboard: dashboard.value, backups, sync: await localDatabase.sync.toArray() },
      null,
      2,
    )
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'nav-backup.json'
    a.click()
    URL.revokeObjectURL(url)
  }
  window.addEventListener('nav-storage-changed', (event) => {
    const detail = (event as CustomEvent<Partial<StorageNotice> & { external?: boolean }>).detail
    void (async () => {
      if (detail?.external && detail.key) {
        // Read without adapter.cached(): observing a notification must not
        // advance a stale editor's generation and permit it to overwrite a draft.
        const row = await localDatabase.sync.get(detail.key)
        if (row && dashboard.value && !sameDashboardContent(dashboard.value, row.snapshot)) {
          history.value = []
          future.value = []
        }
      }
      const adapter = await getStorageAdapter()
      await refreshStatus()
      if (!writes && !unsaved && !isEditing && adapter.cached) {
        const cached = await adapter.cached()
        if (cached) dashboard.value = cached
      }
    })().catch(() => {})
  })
  return {
    dashboard,
    loading,
    error,
    syncState,
    recoveryPreview,
    history,
    future,
    load,
    save,
    commit,
    applyCanvasCommand,
    addWidget,
    removeWidget,
    clearAllWidgets,
    updateWidgetConfig,
    updateWidgetLayouts,
    updateLayouts,
    updateCanvas,
    setDefaultCamera,
    resetProfile,
    setBase,
    undo,
    redo,
    retry,
    resolveConflict,
    exportData,
  }
})
