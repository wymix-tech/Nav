import type { Dashboard } from '../types/dashboard.js'
import type { SelectionRef } from './scene.js'
export const normalizeQuery = (s: string) =>
  s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
export interface CanvasSearchEntry {
  ref: SelectionRef
  title: string
  type: string
  fields: string[]
}
export function resolveCanvasLabel(
  d: Dashboard,
  r: SelectionRef,
  names: Record<string, string> = {},
): string {
  if (r.kind === 'group')
    return d.canvasScene?.groups.find((g) => g.id === r.id)?.title ?? '已删除的组'
  if (r.kind === 'region')
    return d.canvasScene?.regions.find((g) => g.id === r.id)?.title ?? '已删除的区域'
  const w = d.widgets.find((w) => w.id === r.id)
  return (
    d.canvasScene?.widgetMeta[r.id]?.title ||
    (w ? (names[w.widgetId] ?? w.widgetId) : '已删除的组件')
  )
}
export function canvasSearchIndex(
  d: Dashboard,
  names: Record<string, string> = {},
): CanvasSearchEntry[] {
  return [
    ...d.widgets.map((w) => {
      const ref: SelectionRef = { kind: 'widget', id: w.id },
        fields = [w.id, w.widgetId, names[w.widgetId] ?? w.widgetId]
      if (w.source === 'builtin' && w.widgetId === 'bookmark' && Array.isArray(w.config.groups))
        for (const g of w.config.groups) {
          if (typeof g?.name === 'string') fields.push(g.name)
          if (Array.isArray(g?.bookmarks))
            for (const b of g.bookmarks) {
              if (typeof b?.title === 'string') fields.push(b.title)
              if (typeof b?.url === 'string') fields.push(b.url)
            }
        }
      return {
        ref,
        title: resolveCanvasLabel(d, ref, names),
        type: names[w.widgetId] ?? w.widgetId,
        fields: fields.map(normalizeQuery),
      }
    }),
    ...(d.canvasScene?.groups ?? []).map((g) => ({
      ref: { kind: 'group' as const, id: g.id },
      title: g.title,
      type: '组',
      fields: [normalizeQuery(g.title)],
    })),
    ...(d.canvasScene?.regions ?? []).map((g) => ({
      ref: { kind: 'region' as const, id: g.id },
      title: g.title,
      type: '区域',
      fields: [normalizeQuery(g.title)],
    })),
  ]
}
export function searchCanvas(index: CanvasSearchEntry[], raw: string): CanvasSearchEntry[] {
  const q = normalizeQuery([...raw].slice(0, 128).join('')),
    words = q.split(' ').filter(Boolean).slice(0, 8)
  if (!words.length) return []
  return index
    .filter((e) =>
      words.every((w) => [normalizeQuery(e.title), ...e.fields].some((f) => f.includes(w))),
    )
    .sort((a, b) => {
      const score = (e: CanvasSearchEntry) => {
        const t = normalizeQuery(e.title)
        return t === q ? 0 : t.startsWith(q) ? 1 : t.includes(q) ? 2 : 3
      }
      return (
        score(a) - score(b) ||
        a.ref.kind.localeCompare(b.ref.kind) ||
        a.ref.id.localeCompare(b.ref.id)
      )
    })
    .slice(0, 200)
}
