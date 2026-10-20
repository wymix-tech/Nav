import { normalizeSelection, refKey, type Dashboard, type SelectionRef } from '@nav/shared'

// Shared by canvas gestures, the layers panel and the list selection controls.
export function selectCanvasRef(
  dashboard: Dashboard,
  selected: SelectionRef[],
  target: SelectionRef,
  extend = false,
) {
  const ref = normalizeSelection(dashboard, [target])[0]
  if (!ref) return { selected, target: null, included: false }
  const has = selected.some((r) => refKey(r) === refKey(ref))
  return {
    target: ref,
    selected: extend
      ? has
        ? selected.filter((r) => refKey(r) !== refKey(ref))
        : [...selected, ref]
      : has
        ? selected
        : [ref],
    included: !extend || !has,
  }
}
