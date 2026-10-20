import { ref, watch, onUnmounted, type Ref } from 'vue'
import {
  validCamera,
  legacyCamera,
  fitBounds,
  type CanvasCamera,
  type CanvasViewPreference,
  type Dashboard,
  type Size,
  type Rect,
} from '@nav/shared'
import { localDatabase as db } from '../services/localDatabase'
import { localMode } from '../services/storageAdapter'
import { readViewPreference, writeViewPreference, viewSpaceKey } from './viewPreferenceService'
const sessions = new Map<string, CanvasViewPreference>()
export function useCanvasCamera(
  dashboard: () => Dashboard,
  size: Ref<Size>,
  bounds: () => Rect | null,
) {
  const camera = ref<CanvasCamera>({ centerX: 0, centerY: 0, zoom: 1 })
  const presentation = ref<'spatial' | 'list'>('spatial'),
    ready = ref(false),
    error = ref('')
  let key = '',
    serial = 0,
    timer: ReturnType<typeof setTimeout> | undefined,
    initializing = false
  function snapshot(): CanvasViewPreference {
    return {
      key,
      version: 1,
      camera: { ...camera.value },
      presentation: presentation.value,
      updatedAt: new Date().toISOString(),
    }
  }
  async function flush() {
    if (timer) clearTimeout(timer)
    timer = undefined
    if (!ready.value || !key) return
    const row = snapshot()
    sessions.set(key, row)
    try {
      await writeViewPreference(row)
      error.value = ''
    } catch {
      error.value = '视角未保存'
    }
  }
  function changed() {
    if (!ready.value || initializing) return
    sessions.set(key, snapshot())
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      void flush()
    }, 300)
  }
  watch([camera, presentation], changed, { deep: true, flush: 'sync' })
  watch(
    [
      () => dashboard().id,
      () => dashboard().instanceId,
      () => size.value.width > 0 && size.value.height > 0,
    ],
    async () => {
      const ticket = ++serial
      if (!size.value.width || !size.value.height) return
      const d = dashboard()
      let nextKey: string
      try {
        nextKey = await viewSpaceKey(d.instanceId, d.id, localMode)
      } catch {
        nextKey = `session:${d.instanceId ?? 'local'}:${d.id}`
        error.value = '视角未保存'
      }
      if (ticket !== serial || (ready.value && nextKey === key)) return
      await flush()
      if (ticket !== serial) return
      ready.value = false
      key = nextKey
      let saved: CanvasViewPreference | null = sessions.get(key) ?? null
      try {
        saved ??= await readViewPreference(key)
      } catch {
        error.value = '视角未保存'
      }
      if (ticket !== serial) return
      let seed: CanvasCamera | undefined
      if (!saved) {
        try {
          const old = await db.backups.get(
            `canvas-seed:${localMode ? 'standalone' : d.instanceId}:${d.id}`,
          )
          if (old) {
            const raw = JSON.parse(old.data)
            if (raw.documentVersion === undefined && raw.viewport)
              seed = legacyCamera(raw.viewport, size.value, {
                width: raw.viewportWidth ?? 1920,
                height: raw.viewportHeight ?? 1080,
              })
          }
        } catch {
          /* Invalid legacy seeds never replace valid defaults. */
        }
      }
      if (ticket !== serial) return
      initializing = true
      camera.value =
        saved?.camera ??
        seed ??
        (validCamera(d.canvasSettings?.defaultCamera)
          ? { ...d.canvasSettings!.defaultCamera }
          : (fitBounds(bounds(), size.value)?.camera ?? { centerX: 0, centerY: 0, zoom: 1 }))
      presentation.value = saved?.presentation ?? 'spatial'
      initializing = false
      ready.value = true
      changed()
    },
    { immediate: true },
  )
  const hidden = () => {
    if (document.hidden) void flush()
  }
  const pagehide = () => {
    void flush()
  }
  document.addEventListener('visibilitychange', hidden)
  window.addEventListener('pagehide', pagehide)
  onUnmounted(() => {
    serial++
    void flush()
    document.removeEventListener('visibilitychange', hidden)
    window.removeEventListener('pagehide', pagehide)
  })
  return { camera, presentation, ready, error, flush }
}
