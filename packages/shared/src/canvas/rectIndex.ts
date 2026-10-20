import { contentBounds } from './geometry.js'
import { intersects } from './scene.js'
import type { Rect } from './types.js'
export interface RectEntry extends Rect {
  id: string
}
interface Node {
  bounds: Rect
  entries?: RectEntry[]
  left?: Node
  right?: Node
}
export interface RectIndex {
  readonly epoch: number
  readonly bounds: Rect | null
  queryIntersect(rect: Rect): string[]
}
/** Immutable, deterministic candidates. Positive-area intersection matches scene semantics. */
export function buildRectIndex(
  source: RectEntry[],
  epoch = 0,
  backend: 'linear' | 'tree' = 'linear',
): RectIndex {
  const entries = source.map((r) => ({ ...r }))
  function build(items: RectEntry[]): Node {
    const bounds = contentBounds(items)!
    if (items.length <= 8) return { bounds, entries: items }
    const axis = bounds.w >= bounds.h ? 'x' : 'y'
    items.sort((a, b) => a[axis] - b[axis] || a.id.localeCompare(b.id))
    const middle = Math.floor(items.length / 2)
    return { bounds, left: build(items.slice(0, middle)), right: build(items.slice(middle)) }
  }
  const order = new Map(entries.map((r, i) => [r.id, i]))
  const root = backend === 'tree' && entries.length >= 32 ? build([...entries]) : null
  return {
    epoch,
    bounds: contentBounds(entries),
    queryIntersect(rect) {
      const found = new Set<string>()
      function visit(node: Node) {
        if (!intersects(rect, node.bounds)) return
        if (node.entries)
          for (const r of node.entries) {
            if (intersects(rect, r)) found.add(r.id)
          }
        else {
          visit(node.left!)
          visit(node.right!)
        }
      }
      if (root) visit(root)
      else for (const r of entries) if (intersects(rect, r)) found.add(r.id)
      return [...found].sort((a, b) => order.get(a)! - order.get(b)!)
    },
  }
}
/** An index is disposable. Known failure/stale epoch always uses complete exact geometry. */
export function queryRectIndex(
  index: RectIndex,
  expectedEpoch: number,
  rect: Rect,
  fallback: () => RectEntry[],
): string[] {
  if (index.epoch === expectedEpoch) {
    try {
      return index.queryIntersect(rect)
    } catch {
      /* Rebuildable optimization must not block editing. */
    }
  }
  return buildRectIndex(fallback(), expectedEpoch, 'linear').queryIntersect(rect)
}
