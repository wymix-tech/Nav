import type { Dashboard, CanvasLayout } from '../types/dashboard.js'
import { CANVAS } from './constants.js'
import { contentBounds } from './geometry.js'
import type { Rect } from './types.js'
import { assert, record } from '../validation.js'

export interface CanvasWidgetMeta {
  title: string
  locked: boolean
}
export interface CanvasGroup {
  id: string
  title: string
  memberIds: string[]
  locked: boolean
}
export const REGION_COLORS = [
  'slate',
  'blue',
  'cyan',
  'green',
  'amber',
  'orange',
  'rose',
  'violet',
] as const
export interface CanvasRegion extends Rect {
  id: string
  title: string
  color: (typeof REGION_COLORS)[number]
  locked: boolean
}
export type CanvasLayerRef = { kind: 'widget' | 'group'; id: string }
export type SelectionRef = { kind: 'widget' | 'group' | 'region'; id: string }
export interface CanvasScene {
  version: 1
  widgetMeta: Record<string, CanvasWidgetMeta>
  groups: CanvasGroup[]
  regions: CanvasRegion[]
  layers: CanvasLayerRef[]
}
export const refKey = (r: SelectionRef) => `${r.kind}:${r.id}`
export function initialScene(ids: string[]): CanvasScene {
  return {
    version: 1,
    widgetMeta: Object.fromEntries(ids.map((id) => [id, { title: '', locked: false }])),
    groups: [],
    regions: [],
    layers: ids.map((id) => ({ kind: 'widget', id })),
  }
}
export function validTitle(s: unknown, empty = false): s is string {
  return typeof s === 'string' && s === s.trim() && (empty || s.length > 0) && [...s].length <= 80
}
export function validateRegion(r: Rect) {
  const p = CANVAS.positionLimit,
    end = p + CANVAS.maxSize
  assert(
    [r.x, r.y, r.w, r.h].every(Number.isFinite) &&
      r.w >= 40 &&
      r.h >= 40 &&
      r.x >= -p &&
      r.y >= -p &&
      r.x + r.w <= end &&
      r.y + r.h <= end,
    '区域坐标或尺寸无效',
  )
}
export function validateScene(scene: unknown, ids: string[]): asserts scene is CanvasScene {
  assert(record(scene) && scene.version === 1 && record(scene.widgetMeta), '缺少有效 canvasScene')
  const safeId = (id: unknown): id is string =>
    typeof id === 'string' &&
    /^[\w-]{1,100}$/.test(id) &&
    !['__proto__', 'prototype', 'constructor'].includes(id)
  const all = new Set(ids),
    members = new Set<string>(),
    expected = new Set<string>()
  assert(
    Object.keys(scene.widgetMeta).length === ids.length &&
      ids.every((id) => Object.hasOwn(scene.widgetMeta, id)),
    '组件元数据引用不完整',
  )
  for (const meta of Object.values(scene.widgetMeta))
    assert(
      record(meta) && validTitle(meta.title, true) && typeof meta.locked === 'boolean',
      '组件名称或锁无效',
    )
  assert(
    Array.isArray(scene.groups) &&
      scene.groups.length <= 50 &&
      Array.isArray(scene.regions) &&
      scene.regions.length <= 50 &&
      Array.isArray(scene.layers),
    '场景数量超限或格式无效',
  )
  for (const g of scene.groups) {
    assert(
      record(g) &&
        safeId(g.id) &&
        !all.has(g.id) &&
        validTitle(g.title) &&
        typeof g.locked === 'boolean',
      '组 ID、名称或锁无效',
    )
    all.add(g.id)
    assert(
      Array.isArray(g.memberIds) && g.memberIds.length >= 2 && g.memberIds.length <= 100,
      '组至少需要两个成员',
    )
    for (const id of g.memberIds) {
      assert(ids.includes(id) && !members.has(id), '组成员不存在或重复')
      members.add(id)
    }
    expected.add(`group:${g.id}`)
  }
  for (const id of ids) if (!members.has(id)) expected.add(`widget:${id}`)
  for (const r of scene.regions) {
    assert(
      record(r) &&
        safeId(r.id) &&
        !all.has(r.id) &&
        validTitle(r.title) &&
        typeof r.locked === 'boolean' &&
        REGION_COLORS.includes(r.color),
      '区域 ID、名称、颜色或锁无效',
    )
    all.add(r.id)
    validateRegion(r as CanvasRegion)
  }
  for (const layer of scene.layers) {
    assert(
      record(layer) &&
        ['widget', 'group'].includes(layer.kind) &&
        typeof layer.id === 'string' &&
        expected.delete(refKey(layer as CanvasLayerRef)),
      '图层引用无效或重复',
    )
  }
  assert(expected.size === 0, '图层引用不完整')
}
export function groupFor(d: Dashboard, id: string) {
  return d.canvasScene?.groups.find((g) => g.memberIds.includes(id))
}
export function normalizeSelection(d: Dashboard, refs: SelectionRef[]): SelectionRef[] {
  const seen = new Set<string>(),
    out: SelectionRef[] = []
  for (let r of refs) {
    if (r.kind === 'widget') {
      if (!d.widgets.some((w) => w.id === r.id)) continue
      const g = groupFor(d, r.id)
      if (g) r = { kind: 'group', id: g.id }
    } else if (
      !(r.kind === 'group' ? d.canvasScene?.groups : d.canvasScene?.regions)?.some(
        (x) => x.id === r.id,
      )
    )
      continue
    if (!seen.has(refKey(r))) {
      seen.add(refKey(r))
      out.push(r)
    }
  }
  return out
}
export function selectionWidgets(d: Dashboard, refs: SelectionRef[]): string[] {
  return [
    ...new Set(
      normalizeSelection(d, refs).flatMap((r) =>
        r.kind === 'widget'
          ? [r.id]
          : r.kind === 'group'
            ? d.canvasScene!.groups.find((g) => g.id === r.id)!.memberIds
            : [],
      ),
    ),
  ]
}
export function effectiveLocked(d: Dashboard, r: SelectionRef): boolean {
  const s = d.canvasScene
  if (!s) return false
  if (r.kind === 'region') return !!s.regions.find((x) => x.id === r.id)?.locked
  if (r.kind === 'widget') return !!s.widgetMeta[r.id]?.locked || !!groupFor(d, r.id)?.locked
  const g = s.groups.find((x) => x.id === r.id)
  return !!g && (g.locked || g.memberIds.some((id) => s.widgetMeta[id].locked))
}
export function sceneRanks(d: Dashboard): Record<string, number> {
  return Object.fromEntries(
    (d.canvasScene?.layers ?? [])
      .flatMap((r) =>
        r.kind === 'widget' ? [r.id] : d.canvasScene!.groups.find((g) => g.id === r.id)!.memberIds,
      )
      .map((id, rank) => [id, rank + 1]),
  )
}
export function widgetRect(d: Dashboard, id: string): CanvasLayout {
  const w = d.widgets.find((w) => w.id === id)
  assert(w, '组件已不存在')
  if (w.canvas) return w.canvas
  const l = w.layouts.lg
  return {
    x: l.x * CANVAS.column,
    y: l.y * CANVAS.row,
    w: l.w * CANVAS.column - CANVAS.gap,
    h: l.h * CANVAS.row - CANVAS.gap,
  }
}
export function selectionRect(d: Dashboard, r: SelectionRef): Rect {
  if (r.kind === 'widget') return widgetRect(d, r.id)
  if (r.kind === 'region') {
    const region = d.canvasScene?.regions.find((x) => x.id === r.id)
    assert(region, '区域已不存在')
    return region
  }
  const g = d.canvasScene?.groups.find((g) => g.id === r.id)
  assert(g, '组已不存在')
  return contentBounds(g.memberIds.map((id) => widgetRect(d, id)))!
}
export const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
export function marqueeSelection(d: Dashboard, box: Rect): SelectionRef[] {
  return (d.canvasScene?.layers ?? []).filter((r) => intersects(box, selectionRect(d, r)))
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (key) => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key]),
        )
        .join(',') +
      '}'
    )
  return JSON.stringify(value) ?? 'undefined'
}
