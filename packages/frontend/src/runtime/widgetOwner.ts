import { inject, type ComputedRef, type InjectionKey } from 'vue'
import type { RuntimeOwner } from './runtimeRegistry'
export const widgetOwnerKey: InjectionKey<ComputedRef<RuntimeOwner | undefined>> =
  Symbol('widget-owner')
export function useWidgetOwner() {
  return inject(widgetOwnerKey)!
}
