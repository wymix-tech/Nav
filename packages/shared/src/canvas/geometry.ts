import { CANVAS } from './constants.js'
import type { CanvasCamera, Point, Rect, Size } from './types.js'
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
export const snapCanvas = (n: number) => Math.round(n / CANVAS.snap) * CANVAS.snap
export function validCamera(c: unknown): c is CanvasCamera {
  const v = c as CanvasCamera | null
  return (
    !!v &&
    Number.isFinite(v.centerX) &&
    Number.isFinite(v.centerY) &&
    Math.abs(v.centerX) <= CANVAS.cameraLimit &&
    Math.abs(v.centerY) <= CANVAS.cameraLimit &&
    Number.isFinite(v.zoom) &&
    v.zoom >= CANVAS.minZoom &&
    v.zoom <= CANVAS.maxZoom
  )
}
export function boundCamera(c: CanvasCamera): CanvasCamera {
  if (![c.centerX, c.centerY, c.zoom].every(Number.isFinite)) throw new Error('相机数值无效')
  return {
    centerX: clamp(c.centerX, -CANVAS.cameraLimit, CANVAS.cameraLimit),
    centerY: clamp(c.centerY, -CANVAS.cameraLimit, CANVAS.cameraLimit),
    zoom: clamp(c.zoom, CANVAS.minZoom, CANVAS.maxZoom),
  }
}
export function worldToScreen(p: Point, c: CanvasCamera, s: Size): Point {
  return {
    x: (p.x - c.centerX) * c.zoom + s.width / 2,
    y: (p.y - c.centerY) * c.zoom + s.height / 2,
  }
}
export function screenToWorld(p: Point, c: CanvasCamera, s: Size): Point {
  return {
    x: (p.x - s.width / 2) / c.zoom + c.centerX,
    y: (p.y - s.height / 2) / c.zoom + c.centerY,
  }
}
export function clientToViewport(p: Point, r: { left: number; top: number }): Point {
  return { x: p.x - r.left, y: p.y - r.top }
}
export function panByScreen(c: CanvasCamera, dx: number, dy: number): CanvasCamera {
  return boundCamera({ ...c, centerX: c.centerX - dx / c.zoom, centerY: c.centerY - dy / c.zoom })
}
export function zoomAt(c: CanvasCamera, anchor: Point, s: Size, zoom: number): CanvasCamera {
  const p = screenToWorld(anchor, c, s),
    z = clamp(zoom, CANVAS.minZoom, CANVAS.maxZoom)
  return boundCamera({
    centerX: p.x - (anchor.x - s.width / 2) / z,
    centerY: p.y - (anchor.y - s.height / 2) / z,
    zoom: z,
  })
}
export function wheelDelta(delta: number, mode: number, page: number): number {
  return clamp(delta * (mode === 1 ? 16 : mode === 2 ? page : 1), -1000, 1000)
}
export function contentBounds(rects: Rect[]): Rect | null {
  if (!rects.length) return null
  if (rects.some((r) => ![r.x, r.y, r.w, r.h].every(Number.isFinite) || r.w <= 0 || r.h <= 0))
    throw new Error('画布范围无效')
  const x = Math.min(...rects.map((r) => r.x)),
    y = Math.min(...rects.map((r) => r.y))
  return {
    x,
    y,
    w: Math.max(...rects.map((r) => r.x + r.w)) - x,
    h: Math.max(...rects.map((r) => r.y + r.h)) - y,
  }
}
export function visibleBounds(c: CanvasCamera, s: Size): Rect {
  const p = screenToWorld({ x: 0, y: 0 }, c, s)
  return { ...p, w: s.width / c.zoom, h: s.height / c.zoom }
}
export function fitBounds(
  b: Rect | null,
  s: Size,
  area: Rect = { x: 0, y: 0, w: s.width, h: s.height },
  padding = 32,
): { camera: CanvasCamera; limited: boolean } | null {
  if (s.width <= 0 || s.height <= 0 || area.w <= padding * 2 || area.h <= padding * 2) return null
  if (!b) return { camera: { centerX: 0, centerY: 0, zoom: 1 }, limited: false }
  if (![b.x, b.y, b.w, b.h].every(Number.isFinite) || b.w <= 0 || b.h <= 0) return null
  const raw = Math.min((area.w - padding * 2) / b.w, (area.h - padding * 2) / b.h),
    zoom = clamp(raw, CANVAS.minZoom, CANVAS.maxZoom)
  return {
    camera: boundCamera({
      centerX: b.x + b.w / 2 - (area.x + area.w / 2 - s.width / 2) / zoom,
      centerY: b.y + b.h / 2 - (area.y + area.h / 2 - s.height / 2) / zoom,
      zoom,
    }),
    limited: raw < CANVAS.minZoom,
  }
}
export function insertRect(
  center: Point,
  size: { w: number; h: number },
  existing: Rect[],
  visible: Rect,
): Rect {
  const make = (dx: number, dy: number): Rect => ({
    x: clamp(snapCanvas(center.x - size.w / 2 + dx), -CANVAS.positionLimit, CANVAS.positionLimit),
    y: clamp(snapCanvas(center.y - size.h / 2 + dy), -CANVAS.positionLimit, CANVAS.positionLimit),
    ...size,
  })
  const fallback = make(0, 0)
  for (let i = 0; i < 64; i++) {
    const ring = Math.ceil(Math.sqrt(i)),
      angle = i * 2.399963229728653
    const r =
      i === 0
        ? fallback
        : make(Math.cos(angle) * ring * CANVAS.snap * 2, Math.sin(angle) * ring * CANVAS.snap * 2)
    if (
      r.x >= visible.x &&
      r.y >= visible.y &&
      r.x + r.w <= visible.x + visible.w &&
      r.y + r.h <= visible.y + visible.h &&
      existing.every(
        (b) => !(r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y),
      )
    )
      return r
  }
  return fallback
}
