import type { WidgetInstance } from './types/dashboard.js'

export const WIDGET_APPEARANCES = ['auto', 'glass', 'solid', 'none', 'legacy'] as const
export type WidgetAppearance = (typeof WIDGET_APPEARANCES)[number]
export const widgetAppearanceOptions: ReadonlyArray<{ value: WidgetAppearance; label: string }> = [
  { value: 'auto', label: '自动（按组件类型）' },
  { value: 'glass', label: '通透玻璃' },
  { value: 'solid', label: '实色' },
  { value: 'none', label: '无背景' },
  { value: 'legacy', label: '原有外观' },
]
export function validWidgetAppearance(value: unknown): value is WidgetAppearance {
  return typeof value === 'string' && WIDGET_APPEARANCES.some((mode) => mode === value)
}
export function resolveWidgetAppearance(
  widget: Pick<WidgetInstance, 'source' | 'widgetId' | 'appearance'>,
  global?: WidgetAppearance,
): Exclude<WidgetAppearance, 'auto'> {
  // Plugin interiors and host presentation remain unchanged in this phase.
  if (widget.source !== 'builtin') return 'legacy'
  const mode = widget.appearance ?? global ?? 'legacy'
  if (mode !== 'auto') return mode
  return ['chat', 'monitor', 'docker'].includes(widget.widgetId) ? 'solid' : 'glass'
}
