import { ref, watch } from 'vue'
import { normalizeSelection, type Dashboard, type SelectionRef } from '@nav/shared'
import { selectCanvasRef } from './selection'
export function useCanvasSelection(dashboard: () => Dashboard) {
  const selected = ref<SelectionRef[]>([]),
    additive = ref(false)
  function choose(ref: SelectionRef, extend = false) {
    const result = selectCanvasRef(dashboard(), selected.value, ref, extend)
    selected.value = result.selected
    return result.included
  }
  watch(
    () => dashboard(),
    () => {
      selected.value = normalizeSelection(dashboard(), selected.value)
    },
  )
  return { selected, additive, choose }
}
