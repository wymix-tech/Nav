import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowReactive,
  watch,
  type Ref,
} from 'vue'
import {
  canvasForWidget,
  visibleBounds,
  createSpatialScene,
  spatialProjection,
  queryRectIndex,
  type CanvasCamera,
  type Dashboard,
  type Rect,
  type Size,
} from '@nav/shared'
import { useRuntimeContext } from '../runtime/useRuntimeReconciler'
import {
  decideVisibility,
  emptyRenderState,
  type RenderState,
  type ResourceMode,
} from './visibilityPolicy'
import { createRenderScheduler } from './renderScheduler'
export function useCanvasRenderPlan(o: {
  dashboard: () => Dashboard
  camera: Ref<CanvasCamera>
  size: Ref<Size>
  root: Ref<HTMLElement | null>
  list: Ref<boolean>
  rect: (id: string) => Rect
}) {
  const scene = createSpatialScene()
  const spatial = computed(() => scene.update(o.dashboard()))
  const runtime = useRuntimeContext(),
    states = shallowReactive(new Map<string, RenderState>()),
    mode = ref<ResourceMode>('safe'),
    scheduler = createRenderScheduler(),
    activation = new Map<string, number>()
  try {
    const old = sessionStorage.getItem('nav_resource_mode')
    if (old === 'full' || old === 'observe') mode.value = old
  } catch {
    /* session-only fallback */
  }
  let frame = 0,
    timer: ReturnType<typeof setTimeout> | undefined,
    disposed = false,
    mounts = 0,
    unmounts = 0
  let planSerial = 0,
    activationSerial = 0
  const activePointers = new Map<number, () => void>()
  let focusRelease: (() => void) | undefined,
    compositionRelease: (() => void) | undefined,
    focusSerial = 0,
    compositionId = ''
  function widgetId(target: EventTarget | null) {
    return target instanceof Element
      ? target.closest<HTMLElement>('[data-widget-id]')?.dataset.widgetId
      : undefined
  }
  function focus() {
    const ticket = ++focusSerial
    void nextTick(() => {
      if (ticket !== focusSerial || disposed) return
      const id = widgetId(document.activeElement)
      if (compositionId && id !== compositionId) {
        compositionRelease?.()
        compositionRelease = undefined
        compositionId = ''
      }
      focusRelease?.()
      focusRelease = id ? runtime.activity.pin(id, 'focus') : undefined
    })
  }
  function pointer(e: PointerEvent) {
    activePointers.get(e.pointerId)?.()
    activePointers.delete(e.pointerId)
    const id = widgetId(e.target)
    if (e.type === 'pointerdown' && id)
      activePointers.set(e.pointerId, runtime.activity.pin(id, 'pointer'))
  }
  function composition(e: CompositionEvent) {
    compositionRelease?.()
    compositionRelease = undefined
    const id = widgetId(e.target)
    compositionId = e.type === 'compositionstart' ? (id ?? '') : ''
    if (e.type === 'compositionstart' && id)
      compositionRelease = runtime.activity.pin(id, 'composition')
  }
  function blur() {
    for (const release of activePointers.values()) release()
    activePointers.clear()
    focus()
  }
  function set(id: string, state: RenderState) {
    const old = states.get(id)
    if (old?.mounted !== state.mounted) {
      if (state.mounted) mounts++
      else if (old) unmounts++
    }
    if (
      !old ||
      Object.keys({ ...old, ...state }).some(
        (key) => old[key as keyof RenderState] !== state[key as keyof RenderState],
      )
    )
      states.set(id, state)
  }
  function plan() {
    cancelAnimationFrame(frame)
    frame = 0
    if (disposed) return
    if (timer) clearTimeout(timer)
    const ticket = planSerial
    const viewport = visibleBounds(o.camera.value, o.size.value),
      now = performance.now(),
      tasks: Parameters<typeof scheduler.replace>[0] = []
    // Query complete geometry; draft positions are evaluated separately below.
    const indexed = new Set(
      queryRectIndex(
        spatial.value.renderIndex,
        spatial.value.epoch,
        viewport,
        () => spatialProjection(o.dashboard()).render,
      ),
    )
    const ids = new Set(o.dashboard().widgets.map((w) => w.id))
    for (const id of states.keys())
      if (!ids.has(id)) {
        states.delete(id)
        activation.delete(id)
      }
    let deadline = Infinity
    for (const w of o.dashboard().widgets) {
      const owner = runtime.registry.owners.get(w.id),
        old = states.get(w.id),
        retained = owner?.policy === 'opaque-retain',
        pinned =
          runtime.activity.has(w.id) ||
          (activation.get(w.id) ?? 0) > now ||
          (owner?.kind === 'chat' && owner.chat.loading.value)
      let rect = o.rect(w.id),
        zoom = o.camera.value.zoom,
        view = viewport
      if (o.list.value && o.root.value) {
        const el = o.root.value.querySelector<HTMLElement>(`[data-widget-id="${w.id}"]`)
        rect = el
          ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }
          : canvasForWidget(w)
        view = {
          x: o.root.value.scrollLeft,
          y: o.root.value.scrollTop,
          w: o.size.value.width,
          h: o.size.value.height,
        }
        zoom = 1
      }
      const state = decideVisibility({
        rect,
        viewport: view,
        zoom,
        now,
        previous: old,
        protected: !!pinned,
        retained,
        mode: mode.value,
      })
      if (state.outsideSince !== undefined && old?.mounted && now - state.outsideSince < 1500)
        deadline = Math.min(deadline, state.outsideSince + 1501)
      if (state.candidateSince !== undefined)
        deadline = Math.min(deadline, state.candidateSince + 121)
      if (state.inactiveSince !== undefined && old?.mounted && now - state.inactiveSince < 1500)
        deadline = Math.min(deadline, state.inactiveSince + 1501)
      const lease = activation.get(w.id)
      if (lease && lease > now) deadline = Math.min(deadline, lease + 1)
      // Streaming is protected for mount, but offscreen views do not parse every token.
      if (owner?.kind === 'chat')
        owner.chat.setVisible(
          state.active &&
            !document.hidden &&
            (o.list.value ||
              indexed.has(w.id) ||
              (rect.x < view.x + view.w &&
                rect.x + rect.w > view.x &&
                rect.y < view.y + view.h &&
                rect.y + rect.h > view.y)),
        )
      if (state.mounted && !old?.mounted && !retained) {
        set(w.id, { ...state, mounted: false })
        tasks.push({
          id: w.id,
          heavy: w.widgetId === 'chat',
          run: () => {
            if (!disposed && ticket === planSerial && ids.has(w.id)) set(w.id, state)
          },
        })
      } else set(w.id, state)
    }
    const warm = [...states.entries()].filter(
      ([id, state]) =>
        state.mounted &&
        !state.active &&
        runtime.registry.owners.get(id)?.policy !== 'opaque-retain' &&
        !runtime.activity.has(id) &&
        (activation.get(id) ?? 0) <= now &&
        state.inactiveSince !== undefined &&
        now - state.inactiveSince >= 1500,
    )
    for (const [id, state] of warm.slice(20)) set(id, { ...state, mounted: false })
    tasks.sort(
      (a, b) =>
        Number((activation.get(b.id) ?? 0) > now) - Number((activation.get(a.id) ?? 0) > now),
    )
    scheduler.replace(tasks)
    if (Number.isFinite(deadline)) timer = setTimeout(schedule, Math.max(1, deadline - now))
  }
  function schedule() {
    planSerial++
    if (!frame && !disposed) frame = requestAnimationFrame(plan)
  }
  watch(
    [
      o.camera,
      o.size,
      o.list,
      () => o.dashboard().widgets,
      () => runtime.activity.version.value,
      () =>
        [...runtime.registry.owners.values()].map((x) => x.kind === 'chat' && x.chat.loading.value),
      mode,
    ],
    schedule,
    { deep: true, immediate: true },
  )
  watch(mode, (value) => {
    try {
      sessionStorage.setItem('nav_resource_mode', value)
    } catch {
      /* no storage */
    }
  })
  onMounted(() => {
    document.addEventListener('focusin', focus)
    document.addEventListener('focusout', focus)
    document.addEventListener('pointerdown', pointer, true)
    document.addEventListener('pointerup', pointer, true)
    document.addEventListener('pointercancel', pointer, true)
    document.addEventListener('lostpointercapture', pointer, true)
    window.addEventListener('blur', blur)
    document.addEventListener('compositionstart', composition, true)
    document.addEventListener('compositionend', composition, true)
    document.addEventListener('visibilitychange', schedule)
    o.root.value?.addEventListener('scroll', schedule, { passive: true })
    schedule()
  })
  onUnmounted(() => {
    disposed = true
    focusSerial++
    cancelAnimationFrame(frame)
    if (timer) clearTimeout(timer)
    scheduler.dispose()
    focusRelease?.()
    compositionRelease?.()
    for (const release of activePointers.values()) release()
    document.removeEventListener('focusin', focus)
    document.removeEventListener('focusout', focus)
    document.removeEventListener('pointerdown', pointer, true)
    document.removeEventListener('pointerup', pointer, true)
    document.removeEventListener('pointercancel', pointer, true)
    document.removeEventListener('lostpointercapture', pointer, true)
    window.removeEventListener('blur', blur)
    document.removeEventListener('compositionstart', composition, true)
    document.removeEventListener('compositionend', composition, true)
    document.removeEventListener('visibilitychange', schedule)
    o.root.value?.removeEventListener('scroll', schedule)
    for (const owner of runtime.registry.owners.values())
      if (owner.kind === 'chat') owner.chat.setVisible(!document.hidden)
  })
  const diagnostics = computed(() => ({
    hosts: o.dashboard().widgets.length,
    mounted: [...states.values()].filter((s) => s.mounted).length,
    full: [...states.values()].filter((s) => s.level === 'full').length,
    summary: [...states.values()].filter((s) => s.level === 'summary').length,
    outline: [...states.values()].filter((s) => s.level === 'outline').length,
    overBudget:
      [...states.values()].filter((s) => s.active).length > 40 ||
      [...states].filter(
        ([id, state]) =>
          state.mounted && runtime.registry.owners.get(id)?.policy === 'opaque-retain',
      ).length > 40,
  }))
  return {
    states,
    mode,
    diagnostics,
    schedule,
    get: (id: string) => states.get(id) ?? emptyRenderState,
    cancelActivation() {
      activationSerial++
      activation.clear()
    },
    async activate(id: string) {
      const ticket = ++activationSerial
      const space = runtime.registry.spaceKey,
        generation = runtime.registry.owners.get(id)?.generation
      activation.set(id, performance.now() + 5000)
      plan()
      await nextTick()
      const start = performance.now()
      while (
        !disposed &&
        ticket === activationSerial &&
        runtime.registry.spaceKey === space &&
        runtime.registry.owners.get(id)?.generation === generation &&
        performance.now() - start < 2000 &&
        o.dashboard().widgets.some((w) => w.id === id)
      ) {
        const el = o.root.value?.querySelector<HTMLElement>(`[data-widget-id="${id}"]`)
        if (states.get(id)?.mounted && el?.querySelector('[data-view-ready="true"]')) return true
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
      return false
    },
    counters() {
      return { mounts, unmounts, ...scheduler.diagnostics(), ...runtime.registry.diagnostics() }
    },
  }
}
