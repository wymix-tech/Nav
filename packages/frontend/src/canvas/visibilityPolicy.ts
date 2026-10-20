import { intersects, type Rect } from '@nav/shared'
export type DisplayLevel = 'full' | 'summary' | 'outline' | 'offscreen'
export type ResourceMode = 'observe' | 'safe' | 'full'
export interface RenderState {
  level: DisplayLevel
  mounted: boolean
  active: boolean
  inactiveSince?: number
  outsideSince?: number
  candidate?: DisplayLevel
  candidateSince?: number
}
export const emptyRenderState: RenderState = Object.freeze({
  level: 'outline',
  mounted: false,
  active: false,
})
export const expandRect = (r: Rect, padding: number): Rect => ({
  x: r.x - padding,
  y: r.y - padding,
  w: r.w + padding * 2,
  h: r.h + padding * 2,
})
function levelFor(rect: Rect, zoom: number, factor = 1): DisplayLevel {
  if (zoom >= 0.4 * factor && rect.w * zoom >= 160 * factor && rect.h * zoom >= 80 * factor)
    return 'full'
  if (zoom >= 0.12 * factor && rect.w * zoom >= 48 * factor && rect.h * zoom >= 24 * factor)
    return 'summary'
  return 'outline'
}
const rank = { offscreen: -1, outline: 0, summary: 1, full: 2 }
export function decideVisibility(o: {
  rect: Rect
  viewport: Rect
  zoom: number
  now: number
  previous?: RenderState
  protected: boolean
  retained: boolean
  mode: ResourceMode
}): RenderState {
  const { rect, viewport, zoom, now, previous: p } = o
  if (o.mode !== 'safe' || o.protected) return { level: 'full', mounted: true, active: true }
  const near = intersects(rect, expandRect(viewport, 160 / zoom)),
    keep = intersects(rect, expandRect(viewport, 320 / zoom)),
    visible = intersects(rect, viewport)
  let level: DisplayLevel = visible ? levelFor(rect, zoom) : 'offscreen'
  let candidate: DisplayLevel | undefined, candidateSince: number | undefined
  if (p && visible && p.level !== 'offscreen' && level !== p.level) {
    const factor = rank[level] > rank[p.level] ? 1.1 : 0.9
    level = levelFor(rect, zoom, factor)
    if (level !== p.level) {
      candidate = level
      candidateSince = p.candidate === candidate ? p.candidateSince : now
      if (now - (candidateSince ?? now) < 120) level = p.level
      else {
        candidate = undefined
        candidateSince = undefined
      }
    }
  }
  const outsideSince = keep ? undefined : (p?.outsideSince ?? now)
  const mounted =
    o.retained ||
    (near && levelFor(rect, zoom) === 'full') ||
    (!!p?.mounted && (outsideSince === undefined || now - outsideSince < 1500))
  return {
    level,
    mounted,
    active: visible && level === 'full',
    inactiveSince: visible && level === 'full' ? undefined : (p?.inactiveSince ?? now),
    outsideSince,
    candidate,
    candidateSince,
  }
}
