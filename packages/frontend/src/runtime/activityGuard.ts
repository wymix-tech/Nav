import { ref } from 'vue'
export function createActivityGuard() {
  const version = ref(0),
    pins = new Map<string, Map<symbol, string>>()
  return {
    version,
    pin(id: string, reason: string) {
      const token = Symbol(reason),
        reasons = pins.get(id) ?? new Map<symbol, string>()
      pins.set(id, reasons)
      reasons.set(token, reason)
      version.value++
      let released = false
      return () => {
        if (released) return
        released = true
        reasons.delete(token)
        if (!reasons.size) pins.delete(id)
        version.value++
      }
    },
    has(id: string) {
      return !!pins.get(id)?.size
    },
    reasons(id: string) {
      return [...(pins.get(id)?.values() ?? [])]
    },
    diagnostics() {
      return {
        protectedWidgets: pins.size,
        tokens: [...pins.values()].reduce((n, reasons) => n + reasons.size, 0),
      }
    },
    clear() {
      pins.clear()
      version.value++
    },
  }
}
