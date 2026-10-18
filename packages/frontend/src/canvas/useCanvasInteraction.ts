import { ref, onUnmounted, type Ref } from 'vue'
import {
  CANVAS,
  panByScreen,
  zoomAt,
  screenToWorld,
  clientToViewport,
  boundCamera,
  clamp,
  snapCanvas,
  wheelDelta,
  type CanvasCamera,
  type CanvasLayout,
  type WidgetInstance,
  type Size,
  type Point,
} from '@nav/shared'
import { widgetCanvas, resolveWidgetSize } from './resolveWidgetSize'
interface Options {
  root: Ref<HTMLElement | null>
  camera: Ref<CanvasCamera>
  size: Ref<Size>
  hand: Ref<boolean>
  enabled: () => boolean
  canEdit: () => boolean
  widgets: () => WidgetInstance[]
  commit: (id: string, c: CanvasLayout) => void
  interaction: (active: boolean) => void
}
export function useCanvasInteraction(o: Options) {
  const draft = ref<{ id: string; canvas: CanvasLayout } | null>(null),
    space = ref(false)
  type Active = {
    mode: 'pan' | 'move' | 'resize' | 'pinch'
    pointer: number
    start: Point
    camera: CanvasCamera
    origin: CanvasCamera
    id?: string
    canvas?: CanvasLayout
    middle?: Point
    distance?: number
  }
  let active: Active | null = null,
    frame = 0
  const pointers = new Map<number, Point>()
  let wheelStart: CanvasCamera | null = null,
    timer: ReturnType<typeof setTimeout> | undefined
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
  function cancel() {
    cancelAnimationFrame(frame)
    const a = active
    active = null
    if (a) o.camera.value = a.origin
    draft.value = null
    release()
    endWheel(true)
    space.value = false
    o.interaction(false)
  }
  function point(e: PointerEvent): Point {
    return { x: e.clientX, y: e.clientY }
  }
  function local(p: Point): Point {
    return clientToViewport(p, o.root.value!.getBoundingClientRect())
  }
  function start(e: PointerEvent, mode: 'pan' | 'move' | 'resize' = 'pan', w?: WidgetInstance) {
    if (!o.enabled() || ![0, 1].includes(e.button)) return
    const target = e.target as Element
    if (target.closest('.canvas-ui,[role="dialog"]')) return
    const forcePan = e.button === 1 || space.value || o.hand.value
    if (forcePan) mode = 'pan'
    if (mode !== 'pan' && !o.canEdit()) return
    if (mode === 'pan' && !forcePan && target.closest('.canvas-item')) return
    if (active) {
      if (e.pointerType !== 'touch' || active.mode !== 'pan') return
      e.preventDefault()
      e.stopPropagation()
      pointers.set(e.pointerId, point(e))
      o.root.value!.setPointerCapture(e.pointerId)
      const [a, b] = [...pointers.values()]
      active = {
        ...active,
        mode: 'pinch',
        camera: { ...o.camera.value },
        middle: local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      }
      return
    }
    endWheel()
    e.preventDefault()
    e.stopPropagation()
    o.root.value!.focus({ preventScroll: true })
    pointers.set(e.pointerId, point(e))
    o.root.value!.setPointerCapture(e.pointerId)
    active = {
      mode,
      pointer: e.pointerId,
      start: point(e),
      camera: { ...o.camera.value },
      origin: { ...o.camera.value },
      id: w?.id,
      canvas: w ? { ...widgetCanvas(w) } : undefined,
    }
    o.interaction(true)
  }
  function preview(e: PointerEvent) {
    if (!active || !pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, point(e))
    const a = active
    if (a.mode === 'pinch') {
      const [p, q] = [...pointers.values()]
      if (!q) return
      const mid = local({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }),
        z = clamp(
          (a.camera.zoom * Math.hypot(p.x - q.x, p.y - q.y)) / a.distance!,
          CANVAS.minZoom,
          CANVAS.maxZoom,
        )
      const world = screenToWorld(a.middle!, a.camera, o.size.value)
      o.camera.value = boundCamera({
        centerX: world.x - (mid.x - o.size.value.width / 2) / z,
        centerY: world.y - (mid.y - o.size.value.height / 2) / z,
        zoom: z,
      })
    } else if (a.mode === 'pan')
      o.camera.value = panByScreen(a.camera, e.clientX - a.start.x, e.clientY - a.start.y)
    else {
      const w = o.widgets().find((w) => w.id === a.id)
      if (!w || !o.canEdit()) {
        cancel()
        return
      }
      const c = a.canvas!,
        dx = (e.clientX - a.start.x) / a.camera.zoom,
        dy = (e.clientY - a.start.y) / a.camera.zoom
      const min = resolveWidgetSize(w.widgetId, w.source)
      draft.value = {
        id: w.id,
        canvas:
          a.mode === 'move'
            ? {
                ...c,
                x: clamp(snapCanvas(c.x + dx), -CANVAS.positionLimit, CANVAS.positionLimit),
                y: clamp(snapCanvas(c.y + dy), -CANVAS.positionLimit, CANVAS.positionLimit),
              }
            : {
                ...c,
                w: clamp(snapCanvas(c.w + dx), min.minWidth, CANVAS.maxSize),
                h: clamp(snapCanvas(c.h + dy), min.minHeight, CANVAS.maxSize),
              },
      }
    }
  }
  function move(e: PointerEvent) {
    if (!active || !pointers.has(e.pointerId)) return
    // Keep both touch positions fresh even if RAF coalesces their events.
    pointers.set(e.pointerId, point(e))
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => preview(e))
  }
  function finish(e: PointerEvent) {
    if (!active || !pointers.has(e.pointerId)) return
    cancelAnimationFrame(frame)
    preview(e)
    const a = active,
      result = draft.value
    active = null
    draft.value = null
    release()
    if (
      a &&
      a.mode !== 'pan' &&
      a.mode !== 'pinch' &&
      result &&
      o.canEdit() &&
      JSON.stringify(result.canvas) !== JSON.stringify(a.canvas)
    )
      o.commit(result.id, result.canvas)
    o.interaction(false)
  }
  function wheel(e: WheelEvent) {
    if (!o.enabled() || active || (e.target as Element).closest('.canvas-ui,.canvas-item')) return
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
    if (e.key === 'Escape' && (active || wheelStart || o.hand.value)) {
      e.preventDefault()
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
  }
  const lost = (e: PointerEvent) => {
    if (active && pointers.has(e.pointerId)) cancel()
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
  return { draft, space, start, move, finish, cancel, lost, wheel, endWheel }
}
