import { inject, onUnmounted, provide, ref, watch, type InjectionKey, type Ref } from 'vue'
import type { Dashboard, InstalledWidget } from '@nav/shared'
import { viewSpaceKey } from '../canvas/viewPreferenceService'
import { localMode } from '../services/storageAdapter'
import { createRuntimeRegistry } from './runtimeRegistry'
import { clockDiagnostics } from '../services/clockService'
import { monitorDiagnostics } from '../services/monitorService'
import { dockerDiagnostics } from '../services/dockerService'
import { weatherDiagnostics } from '../services/weatherService'
import { resetMonitor } from '../services/monitorService'
import { resetDocker } from '../services/dockerService'
import { resetChatMetadata } from '../services/chatMetadata'
import { createActivityGuard } from './activityGuard'
export interface RuntimeContext {
  registry: ReturnType<typeof createRuntimeRegistry>
  activity: ReturnType<typeof createActivityGuard>
  ready: Ref<boolean>
  hasSession: () => boolean
}
export const runtimeContextKey: InjectionKey<RuntimeContext> = Symbol.for('nav.runtime')
export function useRuntimeContext() {
  return inject(runtimeContextKey)!
}
export function useRuntimeReconciler(
  dashboard: () => Dashboard | null,
  installed: () => InstalledWidget[],
  allowed: () => boolean,
  headers: () => Record<string, string>,
) {
  let storage: Storage | undefined
  try {
    storage = sessionStorage
  } catch {
    /* Memory remains available when storage is disabled. */
  }
  const registry = createRuntimeRegistry({
      storage,
      headers,
      invalidAuth: () => window.dispatchEvent(new Event('nav-auth-invalid')),
    }),
    activity = createActivityGuard(),
    ready = ref(false)
  const context = { registry, activity, ready, hasSession: allowed }
  provide(runtimeContextKey, context)
  let serial = 0,
    disposed = false
  let boundIdentity = ''
  watch(
    [() => dashboard()?.id, () => dashboard()?.instanceId],
    async () => {
      const d = dashboard()
      if (!d) return
      const nextIdentity = JSON.stringify([d.id, d.instanceId])
      if (ready.value && nextIdentity === boundIdentity) {
        registry.reconcile(registry.spaceKey, d.widgets, installed())
        return
      }
      const ticket = ++serial
      if (!localMode && !d.instanceId) {
        ready.value = false
        return
      }
      ready.value = false
      registry.endSpace()
      resetMonitor()
      resetDocker()
      resetChatMetadata()
      let key: string
      try {
        key = await viewSpaceKey(d.instanceId, d.id, localMode)
      } catch {
        key = `session:${d.instanceId ?? 'local'}:${d.id}`
      }
      if (disposed || ticket !== serial || !dashboard()) return
      registry.reconcile(key, dashboard()!.widgets, installed())
      activity.clear()
      boundIdentity = nextIdentity
      ready.value = true
    },
    { immediate: true, flush: 'sync' },
  )
  watch(
    [() => dashboard()?.widgets, installed],
    () => {
      if (ready.value && dashboard())
        registry.reconcile(registry.spaceKey, dashboard()!.widgets, installed())
    },
    { deep: true, flush: 'sync' },
  )
  watch(
    allowed,
    (value) => {
      if (!value) registry.revoke()
    },
    { flush: 'sync' },
  )
  let previousToken = localStorage.getItem('nav_token')
  const authChanged = () => {
    const next = localStorage.getItem('nav_token')
    if (next === previousToken) return
    previousToken = next
    registry.revoke()
    resetMonitor()
    resetDocker()
    resetChatMetadata()
  }
  window.addEventListener('nav-auth-changed', authChanged)
  const diagnosticsEnabled =
    import.meta.env?.DEV || import.meta.env?.VITE_RUNTIME_DIAGNOSTICS === 'true'
  const diagnostics = () =>
    window.dispatchEvent(
      new CustomEvent('nav-runtime-snapshot', {
        detail: {
          ...registry.diagnostics(),
          ...activity.diagnostics(),
          clock: clockDiagnostics(),
          monitor: monitorDiagnostics(),
          docker: dockerDiagnostics(),
          weather: weatherDiagnostics(),
        },
      }),
    )
  if (diagnosticsEnabled) window.addEventListener('nav-runtime-diagnostics', diagnostics)
  const checkpoint = () => {
    registry.checkpoint()
    for (const owner of registry.owners.values())
      if (owner.kind === 'chat' && (document.hidden || dashboard()?.layoutMode !== 'canvas'))
        owner.chat.setVisible(!document.hidden)
  }
  document.addEventListener('visibilitychange', checkpoint)
  window.addEventListener('pagehide', checkpoint)
  onUnmounted(() => {
    window.removeEventListener('nav-auth-changed', authChanged)
    window.removeEventListener('nav-runtime-diagnostics', diagnostics)
    resetMonitor()
    resetDocker()
    resetChatMetadata()
    disposed = true
    serial++
    registry.dispose()
    activity.clear()
    document.removeEventListener('visibilitychange', checkpoint)
    window.removeEventListener('pagehide', checkpoint)
  })
  return context
}
