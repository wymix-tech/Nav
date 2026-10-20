import type { Dashboard } from '../types/dashboard.js'
import { buildRectIndex } from './rectIndex.js'
import { canvasForWidget, refKey, selectionRect } from './scene.js'
/** No config, names, revision or camera in this projection. */
export function spatialProjection(d: Dashboard) {
  return {
    render: d.widgets
      .map((w) => ({ id: w.id, ...canvasForWidget(w) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    selection: (d.canvasScene?.layers ?? [])
      .map((r) => {
        const { x, y, w, h } = selectionRect(d, r)
        return { id: refKey(r), x, y, w, h }
      })
      .sort((a, b) => a.id.localeCompare(b.id)),
    regions: (d.canvasScene?.regions ?? [])
      .map(({ id, x, y, w, h }) => ({ id, x, y, w, h }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    members: (d.canvasScene?.groups ?? [])
      .map((g) => [g.id, ...[...g.memberIds].sort()])
      .sort((a, b) => a[0].localeCompare(b[0])),
  }
}
export function createSpatialScene() {
  let fingerprint = '',
    epoch = 0
  let snapshot = build(spatialProjection({ widgets: [] } as unknown as Dashboard))
  function build(p: ReturnType<typeof spatialProjection>) {
    return {
      epoch,
      renderIndex: buildRectIndex(p.render, epoch),
      selectionIndex: buildRectIndex(p.selection, epoch),
      regionIndex: buildRectIndex(p.regions, epoch),
    }
  }
  return {
    update(d: Dashboard) {
      const projection = spatialProjection(d),
        next = JSON.stringify(projection)
      if (next !== fingerprint) {
        fingerprint = next
        epoch++
        snapshot = build(projection)
      }
      return snapshot
    },
  }
}
