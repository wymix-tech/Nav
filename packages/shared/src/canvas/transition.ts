import type { Dashboard } from '../types/dashboard.js'
import { assert } from '../validation.js'
import { canonical, effectiveLocked, groupFor, layoutProtected } from './scene.js'
// Compare the current lock state, never the proposed one. Unlock is a separate command.
export function validateCanvasTransition(current: Dashboard, next: Dashboard) {
  for (const w of current.widgets) {
    if (!layoutProtected(current, w.id)) continue
    const other = next.widgets.find((v) => v.id === w.id)
    assert(
      other &&
        canonical(w.canvas) === canonical(other.canvas) &&
        canonical(w.layouts) === canonical(other.layouts),
      '布局已锁定：不能移动、调整大小或删除',
    )
    assert(groupFor(current, w.id)?.id === groupFor(next, w.id)?.id, '布局已锁定：不能修改组成员')
    for (const key of new Set([
      ...Object.keys(current.layoutProfiles ?? {}),
      ...Object.keys(next.layoutProfiles ?? {}),
    ]))
      assert(
        canonical(current.layoutProfiles?.[key]?.[w.id]) ===
          canonical(next.layoutProfiles?.[key]?.[w.id]),
        '布局已锁定：不能改写断点布局',
      )
    assert(
      current.baseColumns === next.baseColumns &&
        current.rowHeight === next.rowHeight &&
        current.columns === next.columns,
      '布局已锁定：不能改写网格基准',
    )
  }
  for (const g of current.canvasScene?.groups ?? []) {
    if (!effectiveLocked(current, { kind: 'group', id: g.id })) continue
    const other = next.canvasScene?.groups.find((x) => x.id === g.id)
    assert(
      other && canonical([...g.memberIds].sort()) === canonical([...other.memberIds].sort()),
      '组已锁定：不能解组或修改成员',
    )
  }
  for (const r of current.canvasScene?.regions ?? []) {
    if (!r.locked) continue
    const other = next.canvasScene?.regions.find((x) => x.id === r.id)
    assert(
      other && ['x', 'y', 'w', 'h'].every((k) => r[k as 'x'] === other[k as 'x']),
      '区域已锁定：不能移动、调整大小或删除',
    )
  }
}
