import { ref, shallowRef, watch, onUnmounted, type Ref } from 'vue'
import {
  CANVAS,
  panByScreen,
  zoomAt,
  screenToWorld,
  clientToViewport,
  boundCamera,
  clamp,
  wheelDelta,
  canonical,
  commonDelta,
  contentBounds,
  effectiveLocked,
  groupFor,
  marqueeSelection,
  normalizeSelection,
  refKey,
  selectionRect,
  selectionWidgets,
  snapSelection,
  visibleBounds,
  widgetRect,
  type CanvasCamera,
  type CanvasLayout,
  type Dashboard,
  type CanvasCommand,
  type CanvasRegion,
  type SelectionRef,
  type Guide,
  type Size,
  type Point,
  type Rect,
} from '@nav/shared'
import { resolveWidgetSize } from './resolveWidgetSize'
export type CanvasTool = 'interact' | 'select' | 'region'
interface Options {
  root: Ref<HTMLElement | null>
  camera: Ref<CanvasCamera>
  size: Ref<Size>
  hand: Ref<boolean>
  tool: Ref<CanvasTool>
  selected: Ref<SelectionRef[]>
  additive: Ref<boolean>
  snapping: Ref<boolean>
  enabled: () => boolean
  canEdit: () => boolean
  dashboard: () => Dashboard
  commit: (command: CanvasCommand) => void
  notice: (message: string) => void
}
export function geometryFingerprint(d: Dashboard, refs: SelectionRef[]) {
  try {
    const normalized = normalizeSelection(d, refs)
    if (canonical(normalized) !== canonical(refs)) return 'invalid'
    return canonical(
      refs.map((r) => ({
        ref: r,
        rect: selectionRect(d, r),
        locked: effectiveLocked(d, r),
        members:
          r.kind === 'group'
            ? d.canvasScene?.groups.find((g) => g.id === r.id)?.memberIds
            : undefined,
        widgets: selectionWidgets(d, [r]).map((id) => ({
          id,
          canvas: widgetRect(d, id),
          locked: d.canvasScene?.widgetMeta[id]?.locked,
          group: groupFor(d, id)?.id,
        })),
      })),
    )
  } catch {
    return 'invalid'
  }
}
export function useCanvasInteraction(o: Options) {
  const draft = ref<{
      widgets: Record<string, CanvasLayout>
      regions: Record<string, CanvasRegion>
      delta?: Point
    } | null>(null),
    space = ref(false),
    marquee = ref<Rect | null>(null),
    regionDraft = ref<Rect | null>(null),
    guides = ref<Guide[]>([])
  type Mode = 'pan' | 'move' | 'resize' | 'pinch' | 'marquee' | 'region'
  type Active = {
    mode: Mode
    pointer: number
    start: Point
    camera: CanvasCamera
    origin: CanvasCamera
    viewport: Size
    refs: SelectionRef[]
    before: SelectionRef[]
    fingerprint: string
    rect?: Rect
    middle?: Point
    distance?: number
    dragged: boolean
    extend: boolean
    refsAtStart: SelectionRef[]
  }
  const active = shallowRef<Active | null>(null)
  let frame = 0,
    wheelStart: CanvasCamera | null = null,
    timer: ReturnType<typeof setTimeout> | undefined
  watch(
    () => o.canEdit(),
    (allowed) => {
      if (!allowed) cancel()
    },
  )
  const pointers = new Map<number, Point>()
  function endWheel(cancel = false) {
    if (timer) clearTimeout(timer)
    timer = undefined
    if (cancel && wheelStart) o.camera.value = wheelStart
    wheelStart = null
  }
  function release() {
    const ids = [...pointers.keys()]
    pointers.clear()
    for (const id of ids)
      if (o.root.value?.hasPointerCapture(id)) o.root.value.releasePointerCapture(id)
  }
  function clearDraft() {
    draft.value = null
    marquee.value = null
    regionDraft.value = null
    guides.value = []
  }
  function cancel() {
    cancelAnimationFrame(frame)
    const a = active.value
    active.value = null
    if (a) {
      o.camera.value = a.origin
      o.selected.value = a.before
    }
    clearDraft()
    release()
    endWheel(true)
    space.value = false
  }
  watch(
    () => geometryFingerprint(o.dashboard(), active.value?.refs ?? []),
    () => {
      if (
        active.value &&
        ['move', 'resize'].includes(active.value.mode) &&
        geometryFingerprint(o.dashboard(), active.value.refs) !== active.value.fingerprint
      ) {
        cancel()
        o.notice('目标已改变，已取消本次操作')
      }
    },
  )
  const point = (e: PointerEvent): Point => ({ x: e.clientX, y: e.clientY })
  const local = (p: Point) => clientToViewport(p, o.root.value!.getBoundingClientRect())
  const world = (p: Point, a: Active) => screenToWorld(local(p), a.camera, o.size.value)
  function start(e: PointerEvent, mode: 'pan' | 'move' | 'resize' = 'pan', target?: SelectionRef) {
    if (!o.enabled() || ![0, 1].includes(e.button) || !o.root.value) return
    const measured = o.root.value.getBoundingClientRect()
    if (
      Math.abs(measured.width - o.size.value.width) > 0.5 ||
      Math.abs(measured.height - o.size.value.height) > 0.5
    )
      return
    const el = e.target as Element
    if (el.closest('.canvas-ui,[role="dialog"]')) return
    if (active.value) {
      if (e.pointerType !== 'touch' || pointers.size !== 1) return
      const [firstId, first] = [...pointers.entries()][0],
        origin = active.value.origin,
        before = active.value.before
      active.value = null
      clearDraft()
      o.selected.value = before
      endWheel()
      pointers.set(e.pointerId, point(e))
      o.root.value.setPointerCapture(e.pointerId)
      const middle = local({ x: (first.x + e.clientX) / 2, y: (first.y + e.clientY) / 2 })
      active.value = {
        mode: 'pinch',
        pointer: firstId,
        start: first,
        camera: { ...o.camera.value },
        origin,
        viewport: { ...o.size.value },
        refs: [],
        before,
        fingerprint: '',
        middle,
        distance: Math.max(1, Math.hypot(first.x - e.clientX, first.y - e.clientY)),
        dragged: false,
        extend: false,
        refsAtStart: [],
      }
      e.preventDefault()
      e.stopPropagation()
      return
    }
    const forcePan = e.button === 1 || space.value || o.hand.value
    let next: Mode = forcePan ? 'pan' : mode
    const before = structuredCloneSafe(o.selected.value),
      extend = e.shiftKey || o.additive.value
    let refs: SelectionRef[] = []
    if (!forcePan) {
      if (target) {
        if (!o.canEdit()) return
        const r = normalizeSelection(o.dashboard(), [target])[0]
        if (!r) return
        const has = o.selected.value.some((x) => refKey(x) === refKey(r))
        if (extend)
          o.selected.value = has
            ? o.selected.value.filter((x) => refKey(x) !== refKey(r))
            : [...o.selected.value, r]
        else if (!has) o.selected.value = [r]
        if (extend && has) {
          e.preventDefault()
          e.stopPropagation()
          return
        }
        refs = next === 'resize' ? [r] : structuredCloneSafe(o.selected.value)
        if (refs.some((r) => effectiveLocked(o.dashboard(), r))) {
          e.preventDefault()
          e.stopPropagation()
          o.notice('所选对象已锁定，请先解锁')
          return
        }
        if (next === 'resize' && (refs[0].kind === 'group' || o.selected.value.length !== 1)) {
          e.preventDefault()
          e.stopPropagation()
          return
        }
      } else {
        if (el.closest('.canvas-item')) return
        if (o.canEdit() && o.tool.value === 'select') next = 'marquee'
        else if (o.canEdit() && o.tool.value === 'region') next = 'region'
      }
    }
    if (next !== 'pan' && !o.canEdit()) return
    endWheel()
    e.preventDefault()
    e.stopPropagation()
    o.root.value.focus({ preventScroll: true })
    pointers.set(e.pointerId, point(e))
    o.root.value.setPointerCapture(e.pointerId)
    active.value = {
      mode: next,
      pointer: e.pointerId,
      start: point(e),
      camera: { ...o.camera.value },
      origin: { ...o.camera.value },
      viewport: { ...o.size.value },
      refs,
      before,
      fingerprint: geometryFingerprint(o.dashboard(), refs),
      rect: refs.length
        ? contentBounds(refs.map((r) => selectionRect(o.dashboard(), r)))!
        : undefined,
      dragged: false,
      extend,
      refsAtStart: structuredCloneSafe(o.selected.value),
    }
  }
  function preview(e: PointerEvent) {
    if (!active.value || !pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, point(e))
    const a = active.value,
      rect = o.root.value!.getBoundingClientRect()
    if (
      Math.abs(rect.width - a.viewport.width) > 0.5 ||
      Math.abs(rect.height - a.viewport.height) > 0.5
    ) {
      cancel()
      return
    }
    if (!['pan', 'pinch'].includes(a.mode) && !o.canEdit()) {
      cancel()
      return
    }
    if (a.refs.length && geometryFingerprint(o.dashboard(), a.refs) !== a.fingerprint) {
      cancel()
      return
    }
    if (a.mode === 'pinch') {
      const [p, q] = [...pointers.values()]
      if (!q) return
      const mid = local({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }),
        z = clamp(
          (a.camera.zoom * Math.hypot(p.x - q.x, p.y - q.y)) / a.distance!,
          CANVAS.minZoom,
          CANVAS.maxZoom,
        ),
        w = screenToWorld(a.middle!, a.camera, o.size.value)
      o.camera.value = boundCamera({
        centerX: w.x - (mid.x - o.size.value.width / 2) / z,
        centerY: w.y - (mid.y - o.size.value.height / 2) / z,
        zoom: z,
      })
      return
    }
    if (a.mode === 'pan') {
      o.camera.value = panByScreen(a.camera, e.clientX - a.start.x, e.clientY - a.start.y)
      return
    }
    if (Math.hypot(e.clientX - a.start.x, e.clientY - a.start.y) >= 5) a.dragged = true
    if (!a.dragged) return
    const begin = world(a.start, a),
      end = world(point(e), a),
      box = {
        x: Math.min(begin.x, end.x),
        y: Math.min(begin.y, end.y),
        w: Math.abs(end.x - begin.x),
        h: Math.abs(end.y - begin.y),
      }
    if (a.mode === 'marquee') {
      marquee.value = box
      o.selected.value = normalizeSelection(o.dashboard(), [
        ...(a.extend ? a.before : []),
        ...marqueeSelection(o.dashboard(), box),
      ])
      return
    }
    if (a.mode === 'region') {
      regionDraft.value = box
      return
    }
    const d = o.dashboard(),
      raw = { x: end.x - begin.x, y: end.y - begin.y },
      widgets: Record<string, CanvasLayout> = {},
      regions: Record<string, CanvasRegion> = {}
    const keys = new Set(a.refs.map(refKey)),
      references = [
        ...(d.canvasScene?.layers ?? []),
        ...(d.canvasScene?.regions ?? []).map((r) => ({ kind: 'region' as const, id: r.id })),
      ]
        .filter((r) => !keys.has(refKey(r)))
        .map((r) => ({ id: refKey(r), rect: selectionRect(d, r) }))
    const snapped =
      o.snapping.value && !e.altKey
        ? snapSelection(
            a.rect!,
            raw,
            references,
            a.camera.zoom,
            visibleBounds(a.camera, o.size.value),
            guides.value,
            a.mode === 'resize' ? 'resize' : 'move',
          )
        : { delta: raw, guides: [] }
    if (a.mode === 'move') {
      const delta = commonDelta(d, a.refs, snapped.delta)
      guides.value = snapped.guides.filter(
        (g) => Math.abs(delta[g.axis] - snapped.delta[g.axis]) < 1e-7,
      )
      for (const id of selectionWidgets(d, a.refs)) {
        const c = widgetRect(d, id)
        widgets[id] = { ...c, x: c.x + delta.x, y: c.y + delta.y }
      }
      for (const r of a.refs.filter((r) => r.kind === 'region')) {
        const c = d.canvasScene!.regions.find((x) => x.id === r.id)!
        regions[r.id] = { ...c, x: c.x + delta.x, y: c.y + delta.y }
      }
      draft.value = { widgets, regions, delta }
    } else {
      const r = a.refs[0],
        c = a.rect!
      if (r.kind === 'widget') {
        const w = d.widgets.find((w) => w.id === r.id)!,
          min = resolveWidgetSize(w.widgetId, w.source)
        widgets[r.id] = {
          ...widgetRect(d, r.id),
          w: clamp(c.w + snapped.delta.x, min.minWidth, CANVAS.maxSize),
          h: clamp(c.h + snapped.delta.y, min.minHeight, CANVAS.maxSize),
        }
      } else {
        const original = d.canvasScene!.regions.find((x) => x.id === r.id)!
        regions[r.id] = {
          ...original,
          w: clamp(c.w + snapped.delta.x, 40, CANVAS.positionLimit + CANVAS.maxSize - c.x),
          h: clamp(c.h + snapped.delta.y, 40, CANVAS.positionLimit + CANVAS.maxSize - c.y),
        }
      }
      const actual = r.kind === 'widget' ? widgets[r.id] : regions[r.id]
      guides.value = snapped.guides.filter(
        (g) =>
          Math.abs((g.axis === 'x' ? actual.w - c.w : actual.h - c.h) - snapped.delta[g.axis]) <
          1e-7,
      )
      draft.value = { widgets, regions }
    }
  }
  function move(e: PointerEvent) {
    if (!active.value || !pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, point(e))
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => preview(e))
  }
  function finish(e: PointerEvent) {
    if (!active.value || !pointers.has(e.pointerId)) return
    cancelAnimationFrame(frame)
    preview(e)
    const a = active.value,
      result = draft.value,
      region = regionDraft.value
    active.value = null
    clearDraft()
    release()
    if (!a) return
    if (a.mode === 'marquee' && !a.dragged && !a.extend) o.selected.value = []
    if (a.mode === 'region' && region && region.w >= 40 && region.h >= 40 && o.canEdit()) {
      const id = crypto.randomUUID()
      o.commit({
        type: 'create-region',
        region: { ...region, id, title: '新区域', color: 'blue', locked: false },
      })
      o.selected.value = [{ kind: 'region', id }]
      o.tool.value = 'select'
    }
    if (
      result &&
      a.dragged &&
      o.canEdit() &&
      geometryFingerprint(o.dashboard(), a.refs) === a.fingerprint
    ) {
      if (a.mode === 'move') o.commit({ type: 'move', refs: a.refs, delta: result.delta! })
      else if (a.mode === 'resize')
        o.commit({ type: 'geometry', widgets: result.widgets, regions: result.regions })
    }
  }
  function wheel(e: WheelEvent) {
    if (!o.enabled() || active.value || (e.target as Element).closest('.canvas-ui,.canvas-item'))
      return
    const dx = wheelDelta(e.deltaX, e.deltaMode, o.size.value.width),
      dy = wheelDelta(e.deltaY, e.deltaMode, o.size.value.height)
    e.preventDefault()
    wheelStart ??= { ...o.camera.value }
    if (e.ctrlKey || e.metaKey)
      o.camera.value = zoomAt(
        o.camera.value,
        clientToViewport({ x: e.clientX, y: e.clientY }, o.root.value!.getBoundingClientRect()),
        o.size.value,
        o.camera.value.zoom * Math.exp(-dy * CANVAS.wheelSensitivity),
      )
    else o.camera.value = panByScreen(o.camera.value, -dx, -dy)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => endWheel(), 300)
  }
  function keydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && (active.value || wheelStart || o.hand.value)) {
      e.preventDefault()
      e.stopImmediatePropagation()
      cancel()
      o.hand.value = false
      return
    }
    if (
      e.code !== 'Space' ||
      !o.enabled() ||
      !o.root.value?.contains(document.activeElement) ||
      (e.target as Element).closest(
        'input,textarea,select,button,[contenteditable],.canvas-item,[role="dialog"]',
      )
    )
      return
    e.preventDefault()
    space.value = true
  }
  const keyup = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.value = false
    },
    lost = (e: PointerEvent) => {
      if (active.value && pointers.has(e.pointerId)) cancel()
    }
  window.addEventListener('keydown', keydown)
  window.addEventListener('keyup', keyup)
  window.addEventListener('blur', cancel)
  onUnmounted(() => {
    cancel()
    window.removeEventListener('keydown', keydown)
    window.removeEventListener('keyup', keyup)
    window.removeEventListener('blur', cancel)
  })
  return {
    draft,
    space,
    marquee,
    regionDraft,
    guides,
    start,
    move,
    finish,
    cancel,
    lost,
    wheel,
    endWheel,
    hasActive: () => !!active.value,
  }
}
function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}
