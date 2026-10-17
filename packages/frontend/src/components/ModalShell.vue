<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
defineProps<{ label: string }>()
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement | null>(null)
let previous: HTMLElement | null = null,
  overflow = ''
function key(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  }
  if (e.key !== 'Tab' || !panel.value) return
  const all = [
    ...panel.value.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select,textarea,a[href],[tabindex="0"]',
    ),
  ].filter((x) => x.getClientRects().length)
  if (!all.length) {
    e.preventDefault()
    return
  }
  const first = all[0],
    last = all[all.length - 1]
  if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}
onMounted(async () => {
  previous = document.activeElement as HTMLElement
  overflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  await nextTick()
  ;(panel.value?.querySelector<HTMLElement>('[autofocus],input,button') ?? panel.value)?.focus()
})
onUnmounted(() => {
  document.body.style.overflow = overflow
  previous?.focus()
})
</script>
<template>
  <Teleport to="body"
    ><div class="modal-shell" @click.self="emit('close')" @keydown="key">
      <section
        ref="panel"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-label="label"
        class="modal-content"
      >
        <slot />
      </section></div
  ></Teleport>
</template>
<style scoped>
.modal-shell {
  position: fixed;
  inset: 0;
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: #0009;
  backdrop-filter: blur(4px);
}
.modal-content {
  max-width: 100%;
  max-height: calc(100dvh - 32px);
  overflow: auto;
  outline: none;
  border-radius: var(--radius-lg);
}
</style>
