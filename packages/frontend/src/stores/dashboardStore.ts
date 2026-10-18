import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  validateDashboard,
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
  async function commit(next: Dashboard, remember = true): Promise<boolean> {
    if (!editable()) {
      error.value = '请先登录再编辑'
      return false
    }
    try {
      validateDashboard(next)
    } catch (e) {
      error.value = e instanceof Error ? e.message : '配置无效'
      return false
    }
    if (remember && dashboard.value) {
      history.value.push(clone(dashboard.value))
      if (history.value.length > 50) history.value.shift()
      future.value = []
    }
    dashboard.value = clone(next)
    return persist(clone(next))
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
  function addWidget(w: WidgetInstance) {
    return mutate((d) => {
      d.widgets.push(w)
    })
  }
  function removeWidget(id: string) {
    return mutate((d) => {
      d.widgets = d.widgets.filter((w) => w.id !== id)
      for (const map of Object.values(d.layoutProfiles ?? {})) delete map[id]
    })
  }
  function clearAllWidgets() {
    return mutate((d) => {
      d.widgets = []
      d.layoutProfiles = {}
    })
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
    return mutate((d) => {
      const w = d.widgets.find((w) => w.id === id)
      if (w) w.canvas = clone(canvas)
    })
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
    if (!history.value.length || !dashboard.value) return
    const target = history.value.pop()!
    future.value.push(clone(dashboard.value))
    await commit({ ...target, revision: dashboard.value.revision }, false)
  }
  async function redo() {
    if (!future.value.length || !dashboard.value) return
    const target = future.value.pop()!
    history.value.push(clone(dashboard.value))
    await commit({ ...target, revision: dashboard.value.revision }, false)
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
      await a.resolveConflict(local)
      history.value = []
      future.value = []
      await load()
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
    void (async () => {
      const adapter = await getStorageAdapter()
      await refreshStatus()
      if (!writes && !unsaved && !isEditing && adapter.cached) {
        if ((event as CustomEvent).detail?.external) {
          history.value = []
          future.value = []
        }
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
