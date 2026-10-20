import { onUnmounted, watch, type Ref } from 'vue'
import { useWidgetOwner } from './widgetOwner'
import { useRuntimeContext } from './useRuntimeReconciler'
export function useFormProtection(allowed: () => boolean, ...flags: Ref<boolean>[]) {
  const owner = useWidgetOwner(),
    runtime = useRuntimeContext()
  let release: (() => void) | undefined
  watch(
    () => [allowed() || runtime.hasSession(), flags.some((flag) => flag.value)],
    ([allowed, active]) => {
      if (!allowed) {
        for (const flag of flags) flag.value = false
        active = false
      }
      release?.()
      release =
        active && owner.value ? runtime.activity.pin(owner.value.id, 'builtin-form') : undefined
    },
    { immediate: true, flush: 'sync' },
  )
  onUnmounted(() => release?.())
}
