import type { Dashboard, WidgetInstance, WidgetLayout } from './types/dashboard.js'

export type LayoutMap = Record<string, WidgetLayout>
export const GAP = 10
export const constraints: Record<
  string,
  { minWidth: number; minHeight: number; w: number; h: number }
> = {
  search: { minWidth: 280, minHeight: 80, w: 8, h: 2 },
  clock: { minWidth: 200, minHeight: 110, w: 4, h: 3 },
  weather: { minWidth: 240, minHeight: 150, w: 4, h: 3 },
  bookmark: { minWidth: 200, minHeight: 140, w: 4, h: 3 },
  monitor: { minWidth: 260, minHeight: 180, w: 4, h: 3 },
  docker: { minWidth: 280, minHeight: 240, w: 4, h: 4 },
  chat: { minWidth: 320, minHeight: 360, w: 6, h: 6 },
}
const integer = (n: number, fallback: number) => (Number.isFinite(n) ? Math.floor(n) : fallback)
export function normalizeLayout(l: WidgetLayout, cols: number): WidgetLayout {
  cols = Math.max(1, Math.min(24, integer(cols, 12)))
  const w = Math.max(1, Math.min(cols, integer(l?.w, 4)))
  return {
    x: Math.max(0, Math.min(cols - w, integer(l?.x, 0))),
    y: Math.max(0, Math.min(1000, integer(l?.y, 0))),
    w,
    h: Math.max(1, Math.min(100, integer(l?.h, 3))),
  }
}
export function overlaps(a: WidgetLayout, b: WidgetLayout): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}
export function findPlacement(placed: LayoutMap, w: number, h: number, cols: number): WidgetLayout {
  w = Math.min(cols, Math.max(1, w))
  for (let y = 0; y <= 1000; y++)
    for (let x = 0; x <= cols - w; x++) {
      const l = { x, y, w, h }
      if (Object.values(placed).every((p) => !overlaps(l, p))) return l
    }
  throw new Error('布局空间已满，请删除组件或缩小组件')
}
export function resolveCollisions(input: LayoutMap, cols: number, anchor?: string): LayoutMap {
  const entries = Object.entries(input).map(([id, l]) => [id, normalizeLayout(l, cols)] as const)
  entries.sort(([ia, a], [ib, b]) =>
    ia === anchor ? -1 : ib === anchor ? 1 : a.y - b.y || a.x - b.x || ia.localeCompare(ib),
  )
  const result: LayoutMap = Object.create(null)
  for (const [id, layout] of entries) {
    const l = { ...layout }
    while (Object.values(result).some((p) => overlaps(l, p))) {
      l.y = Math.max(
        ...Object.values(result)
          .filter((p) => overlaps(l, p))
          .map((p) => p.y + p.h),
      )
      if (l.y > 1000) throw new Error('布局高度超过限制')
    }
    result[id] = l
  }
  return result
}
export function columnsForWidth(width: number, preferred?: number): number {
  if (width < 768) return 1
  const capacity = Math.max(1, Math.floor((width + GAP) / 90))
  const automatic = width < 1200 ? 8 : width < 1920 ? 12 : width < 2560 ? 16 : 24
  return Math.max(1, Math.min(preferred ?? automatic, capacity, 24))
}
export function profileKey(cols: number): string {
  return `cols-${cols}`
}
export function deriveLayout(
  widgets: WidgetInstance[],
  cols: number,
  baseCols: number,
  profile?: LayoutMap,
  width?: number,
  rowHeight = 80,
): LayoutMap {
  if (profile) {
    const map = Object.fromEntries(widgets.map((w) => [w.id, profile[w.id] ?? w.layouts.lg]))
    return resolveCollisions(map, cols)
  }
  if (cols === baseCols)
    return resolveCollisions(Object.fromEntries(widgets.map((w) => [w.id, w.layouts.lg])), cols)
  const result: LayoutMap = Object.create(null)
  const ordered = [...widgets].sort(
    (a, b) =>
      a.layouts.lg.y - b.layouts.lg.y ||
      a.layouts.lg.x - b.layouts.lg.x ||
      a.id.localeCompare(b.id),
  )
  for (const widget of ordered) {
    const base = normalizeLayout(widget.layouts.lg, cols)
    const c = constraints[widget.widgetId]
    const minW = width && c ? Math.ceil((c.minWidth + GAP) / ((width + GAP) / cols)) : 1
    result[widget.id] = findPlacement(
      result,
      Math.min(cols, Math.max(base.w, minW)),
      Math.max(base.h, c ? Math.ceil((c.minHeight + GAP) / (rowHeight + GAP)) : 1),
      cols,
    )
  }
  return result
}
export function migrateDashboard(input: Dashboard): Dashboard {
  const d: Dashboard = JSON.parse(JSON.stringify(input))
  if (d.layoutVersion !== 2) {
    d.baseColumns = d.columns
    d.layoutVersion = 2
    d.layoutSettings = { columnMode: 'custom', contentWidthMode: 'centered', maxContentWidth: 1600 }
    d.layoutProfiles = {}
    const normalized = resolveCollisions(
      Object.fromEntries(d.widgets.map((w) => [w.id, w.layouts?.lg ?? { x: 0, y: 0, w: 4, h: 3 }])),
      d.columns,
    )
    for (const w of d.widgets) w.layouts = { ...w.layouts, lg: normalized[w.id] }
  }
  d.layoutMode ??= 'grid'
  d.viewport ??= { panX: 0, panY: 0, zoom: 1, homeX: 0, homeY: 0 }
  d.viewportWidth ??= 1920
  d.viewportHeight ??= 1080
  if (d.layoutMode === 'canvas') {
    const unit = (d.viewportWidth - 48 + GAP) / (d.baseColumns ?? d.columns)
    for (const w of d.widgets) {
      const l = w.layouts.lg
      w.canvas ??= {
        x: l.x * unit,
        y: l.y * (d.rowHeight + GAP),
        w: Math.max(80, l.w * unit - GAP),
        h: l.h * (d.rowHeight + GAP) - GAP,
      }
    }
  }
  // Old versions persisted provider credentials in public widget config.
  // Callers retain the original payload in an authenticated backup before migration.
  for (const w of d.widgets)
    if (w.source === 'builtin' && w.widgetId === 'chat') delete w.config.apiKey
  return d
}
export function createDashboard(): Dashboard {
  return {
    id: 'default',
    name: '我的导航',
    title: 'Nav - 个人导航页',
    widgets: [],
    columns: 12,
    baseColumns: 12,
    rowHeight: 80,
    revision: 0,
    layoutVersion: 2,
    layoutSettings: { columnMode: 'auto', contentWidthMode: 'centered', maxContentWidth: 1600 },
    layoutProfiles: {},
    background: { mode: 'color', color: '#0c1021', images: [], interval: 30, index: 0 },
  }
}
