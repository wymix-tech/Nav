import { ref, watch } from 'vue'
import { normalizeSelection, refKey, type Dashboard, type SelectionRef } from '@nav/shared'
export function useCanvasSelection(dashboard: () => Dashboard) {
  const selected = ref<SelectionRef[]>([]),
    additive = ref(false)
  function choose(ref: SelectionRef, extend = false) {
    const r = normalizeSelection(dashboard(), [ref])[0]
    if (!r) return false
    const has = selected.value.some((x) => refKey(x) === refKey(r))
    selected.value = extend
      ? has
        ? selected.value.filter((x) => refKey(x) !== refKey(r))
        : [...selected.value, r]
      : has
        ? selected.value
        : [r]
    return !extend || !has
  }
  watch(
    () => dashboard(),
    () => {
      selected.value = normalizeSelection(dashboard(), selected.value)
    },
  )
  return { selected, additive, choose }
}
