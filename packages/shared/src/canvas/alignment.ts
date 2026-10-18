import { CANVAS } from './constants.js'
import { clamp, contentBounds, snapCanvas } from './geometry.js'
import { intersects, refKey, selectionRect, selectionWidgets, type SelectionRef } from './scene.js'
import type { Dashboard } from '../types/dashboard.js'
import type { Point, Rect } from './types.js'
import { assert } from '../validation.js'
export type AlignAction = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type Guide = {
  axis: 'x' | 'y'
  value: number
  from: number
  to: number
  id: string
  type: 'edge' | 'center' | 'gap'
}
export function commonDelta(d: Dashboard, refs: SelectionRef[], raw: Point): Point {
  const p = CANVAS.positionLimit,
    end = p + CANVAS.maxSize
  const objects = [
    ...selectionWidgets(d, refs).map((id) => ({
      rect: selectionRect(d, { kind: 'widget', id }),
      region: false,
    })),
    ...refs
      .filter((r) => r.kind === 'region')
      .map((r) => ({ rect: selectionRect(d, r), region: true })),
  ]
  return {
    x: clamp(
      raw.x,
      Math.max(-Infinity, ...objects.map((o) => -p - o.rect.x)),
      Math.min(Infinity, ...objects.map((o) => (o.region ? end - o.rect.w : p) - o.rect.x)),
    ),
    y: clamp(
      raw.y,
      Math.max(-Infinity, ...objects.map((o) => -p - o.rect.y)),
      Math.min(Infinity, ...objects.map((o) => (o.region ? end - o.rect.h : p) - o.rect.y)),
    ),
  }
}
export function arrange(
  d: Dashboard,
  refs: SelectionRef[],
  action: AlignAction | 'x' | 'y',
): Map<string, Point> {
  const entries = refs.map((r) => ({ ref: r, rect: selectionRect(d, r) })),
    out = new Map<string, Point>()
  assert(entries.length >= (['x', 'y'].includes(action) ? 3 : 2), '选择的对象数量不足')
  const b = contentBounds(entries.map((x) => x.rect))!
  if (action === 'x' || action === 'y') {
    const axis = action,
      other = axis === 'x' ? 'y' : 'x',
      extent = axis === 'x' ? 'w' : 'h'
    entries.sort(
      (a, b) =>
        a.rect[axis] - b.rect[axis] ||
        a.rect[other] - b.rect[other] ||
        refKey(a.ref).localeCompare(refKey(b.ref)),
    )
    const first = entries[0].rect,
      last = entries.at(-1)!.rect
    const gap =
      (last[axis] + last[extent] - first[axis] - entries.reduce((n, e) => n + e.rect[extent], 0)) /
      (entries.length - 1)
    assert(gap >= 0, '空间不足，无法等距分布')
    let pos = first[axis]
    entries.forEach((e) => {
      out.set(refKey(e.ref), {
        x: axis === 'x' ? pos - e.rect.x : 0,
        y: axis === 'y' ? pos - e.rect.y : 0,
      })
      pos += e.rect[extent] + gap
    })
  } else
    for (const e of entries) {
      const r = e.rect
      out.set(refKey(e.ref), {
        x:
          action === 'left'
            ? b.x - r.x
            : action === 'center'
              ? b.x + b.w / 2 - r.x - r.w / 2
              : action === 'right'
                ? b.x + b.w - r.x - r.w
                : 0,
        y:
          action === 'top'
            ? b.y - r.y
            : action === 'middle'
              ? b.y + b.h / 2 - r.y - r.h / 2
              : action === 'bottom'
                ? b.y + b.h - r.y - r.h
                : 0,
      })
    }
  for (const ref of refs) {
    const delta = out.get(refKey(ref))!,
      legal = commonDelta(d, [ref], delta)
    assert(
      Math.abs(legal.x - delta.x) < 1e-7 && Math.abs(legal.y - delta.y) < 1e-7,
      '对齐结果超出世界边界',
    )
  }
  return out
}
export function snapSelection(
  box: Rect,
  raw: Point,
  references: { id: string; rect: Rect }[],
  zoom: number,
  viewport: Rect,
  held: Guide[] = [],
  mode: 'move' | 'resize' = 'move',
): { delta: Point; guides: Guide[] } {
  const expanded = {
    x: viewport.x - 64 / zoom,
    y: viewport.y - 64 / zoom,
    w: viewport.w + 128 / zoom,
    h: viewport.h + 128 / zoom,
  }
  const refs = references.filter((r) => intersects(r.rect, expanded)),
    moved =
      mode === 'resize'
        ? { ...box, w: box.w + raw.x, h: box.h + raw.y }
        : { ...box, x: box.x + raw.x, y: box.y + raw.y },
    delta = { ...raw },
    guides: Guide[] = []
  for (const axis of ['x', 'y'] as const) {
    const extent = axis === 'x' ? 'w' : 'h',
      cross = axis === 'x' ? 'y' : 'x',
      crossSize = axis === 'x' ? 'h' : 'w'
    const candidates: { adjust: number; guide: Guide; held: boolean }[] = []
    const add = (
      value: number,
      anchor: number,
      id: string,
      type: Guide['type'],
      from: number,
      to: number,
    ) => {
      const adjust = value - anchor,
        keep = held.some(
          (g) =>
            g.axis === axis && g.id === id && g.type === type && Math.abs(g.value - value) < 1e-7,
        )
      if (Math.abs(adjust) * zoom <= (keep ? 10 : 6))
        candidates.push({ adjust, held: keep, guide: { axis, value, from, to, id, type } })
    }
    for (const ref of refs)
      for (const a of mode === 'resize' ? [1] : [0, 0.5, 1])
        for (const t of [0, 0.5, 1])
          add(
            ref.rect[axis] + ref.rect[extent] * t,
            moved[axis] + moved[extent] * a,
            `${ref.id}:${a}:${t}`,
            a === 0.5 || t === 0.5 ? 'center' : 'edge',
            Math.min(ref.rect[cross], moved[cross]),
            Math.max(ref.rect[cross] + ref.rect[crossSize], moved[cross] + moved[crossSize]),
          )
    const nearest = [...refs]
      .sort(
        (a, b) =>
          Math.abs(a.rect[axis] - moved[axis]) - Math.abs(b.rect[axis] - moved[axis]) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 24)
    for (const a of mode === 'resize' ? [] : nearest)
      for (const b of nearest) {
        if (
          a.rect[axis] + a.rect[extent] > moved[axis] ||
          b.rect[axis] < moved[axis] + moved[extent]
        )
          continue
        if (
          Math.max(a.rect[cross], b.rect[cross], moved[cross]) >=
          Math.min(
            a.rect[cross] + a.rect[crossSize],
            b.rect[cross] + b.rect[crossSize],
            moved[cross] + moved[crossSize],
          )
        )
          continue
        const value = (a.rect[axis] + a.rect[extent] + b.rect[axis] - moved[extent]) / 2
        add(
          value,
          moved[axis],
          `${a.id}:${b.id}`,
          'gap',
          moved[cross],
          moved[cross] + moved[crossSize],
        )
      }
    const priority = { edge: 0, center: 1, gap: 2 }
    candidates.sort(
      (a, b) =>
        Number(b.held) - Number(a.held) ||
        Math.abs(a.adjust) - Math.abs(b.adjust) ||
        priority[a.guide.type] - priority[b.guide.type] ||
        a.guide.id.localeCompare(b.guide.id),
    )
    if (candidates[0]) {
      delta[axis] += candidates[0].adjust
      guides.push(candidates[0].guide)
    } else {
      const anchor = mode === 'resize' ? box[extent] : box[axis]
      delta[axis] = snapCanvas(anchor + raw[axis]) - anchor
    }
  }
  return { delta, guides }
}
