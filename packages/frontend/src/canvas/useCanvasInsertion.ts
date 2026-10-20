import {
  CANVAS,
  insertRect,
  screenToWorld,
  clientToViewport,
  visibleBounds,
  type Point,
  type Rect,
  type Size,
  type CanvasCamera,
  type WidgetInstance,
} from '@nav/shared'
import { resolveWidgetSize } from './resolveWidgetSize'
export interface AddWidgetRequest {
  widgetId: string
  source: WidgetInstance['source']
  client?: Point
}
export function createCanvasWidget(
  request: AddWidgetRequest,
  camera: CanvasCamera,
  size: Size,
  root: DOMRect,
  area: Rect,
  existing: Rect[],
  cols: number,
): WidgetInstance {
  const anchor = request.client
    ? clientToViewport(request.client, root)
    : { x: area.x + area.w / 2, y: area.y + area.h / 2 }
  const center = screenToWorld(anchor, camera, size),
    pixels = resolveWidgetSize(request.widgetId, request.source)
  const topLeft = screenToWorld({ x: area.x, y: area.y }, camera, size),
    visible = visibleBounds(camera, { width: area.w, height: area.h })
  const c = insertRect(center, pixels, existing, { ...visible, ...topLeft })
  // Compatibility layout is legal but does not constrain insertion into the canvas.
  const layout = {
    x: 0,
    y: 0,
    w: Math.min(cols, Math.max(1, Math.ceil(pixels.w / CANVAS.column))),
    h: Math.max(1, Math.ceil(pixels.h / CANVAS.row)),
  }
  return {
    id: crypto.randomUUID(),
    widgetId: request.widgetId,
    source: request.source,
    config: {},
    canvas: { x: c.x, y: c.y, w: c.w, h: c.h },
    layouts: { lg: layout, md: layout, sm: layout, xs: layout },
  }
}
