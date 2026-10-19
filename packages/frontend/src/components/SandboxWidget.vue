<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import type { InstalledWidget } from '@nav/shared'
import { pluginDocument, pluginIdentity } from '../services/pluginRuntime'
const props = defineProps<{
  installed: InstalledWidget
  config: Record<string, any>
  editable: boolean
}>()
const emit = defineEmits<{ 'update:config': [config: Record<string, any>] }>()
const iframe = ref<HTMLIFrameElement | null>(null),
  source = ref(''),
  error = ref(''),
  ready = ref(false)
let secret = '',
  port: MessagePort | null = null,
  timer: ReturnType<typeof setTimeout>,
  last = 0,
  count = 0
function dispose() {
  window.removeEventListener('message', receive)
  clearTimeout(timer)
  port?.postMessage({ type: 'dispose' })
  port?.close()
  port = null
}
function start() {
  dispose()
  secret = crypto.randomUUID()
  ready.value = false
  error.value = ''
  try {
    source.value = pluginDocument(props.installed, secret)
    window.addEventListener('message', receive)
    timer = setTimeout(() => {
      error.value = '插件加载超时'
      dispose()
    }, 10000)
  } catch (e) {
    error.value = (e as Error).message
  }
}
function receive(e: MessageEvent) {
  if (
    e.source !== iframe.value?.contentWindow ||
    e.data?.secret !== secret ||
    e.data?.type !== 'plugin-ready' ||
    port
  )
    return
  const channel = new MessageChannel()
  port = channel.port1
  port.onmessage = (e) => {
    const now = Date.now()
    if (now - last > 1000) {
      count = 0
      last = now
    }
    if (++count > 20) return
    const m = e.data
    if (m?.type === 'ready') {
      ready.value = true
      clearTimeout(timer)
    } else if (m?.type === 'error') {
      error.value = String(m.message).slice(0, 200)
      clearTimeout(timer)
    } else if (
      m?.type === 'config' &&
      props.editable &&
      m.config &&
      typeof m.config === 'object' &&
      !Array.isArray(m.config) &&
      JSON.stringify(m.config).length <= 16384
    )
      emit('update:config', m.config)
  }
  iframe.value?.contentWindow?.postMessage(
    { type: 'init', secret, config: JSON.parse(JSON.stringify(props.config)) },
    '*',
    [channel.port2],
  )
}
watch(() => pluginIdentity(props.installed), start, { immediate: true })

watch(
  () => props.config,
  (config) => port?.postMessage({ type: 'config', config: JSON.parse(JSON.stringify(config)) }),
  { deep: true },
)
onUnmounted(dispose)
</script>
<template>
  <div class="sandbox-widget">
    <div v-if="error" class="plugin-error" role="alert">
      {{ error }}<button @click="start">重试</button>
    </div>
    <span v-else-if="!ready">正在加载插件…</span
    ><iframe
      v-if="!error"
      ref="iframe"
      :srcdoc="source"
      sandbox="allow-scripts"
      referrerpolicy="no-referrer"
      :title="installed.manifest.displayName"
    />
  </div>
</template>
<style scoped>
.sandbox-widget {
  height: 100%;
  position: relative;
}
.sandbox-widget iframe {
  border: 0;
  width: 100%;
  height: 100%;
}
.plugin-error {
  padding: 12px;
  overflow-wrap: anywhere;
}
</style>
