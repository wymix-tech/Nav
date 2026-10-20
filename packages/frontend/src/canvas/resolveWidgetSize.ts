import { CANVAS, constraints, type WidgetInstance } from '@nav/shared'
import { useWidgetStore } from '../stores/widgetStore'
export function resolveWidgetSize(widgetId: string, source: WidgetInstance['source']) {
  const c = source === 'builtin' ? constraints[widgetId] : undefined
  const manifest =
    source === 'installed' ? useWidgetStore().getWidget(widgetId)?.manifest : undefined
  const size = c ?? manifest?.size ?? { w: 4, h: 3 }
  const minWidth = c?.minWidth ?? (manifest ? manifest.minSize.w * CANVAS.column - CANVAS.gap : 160)
  const minHeight = c?.minHeight ?? (manifest ? manifest.minSize.h * CANVAS.row - CANVAS.gap : 120)
  return {
    w: Math.max(minWidth, size.w * CANVAS.column - CANVAS.gap),
    h: Math.max(minHeight, size.h * CANVAS.row - CANVAS.gap),
    minWidth,
    minHeight,
  }
}
export { canvasForWidget as widgetCanvas } from '@nav/shared'
