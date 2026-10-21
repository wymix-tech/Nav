<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import ModalShell from './ModalShell.vue'
import { apiJson } from '../services/apiClient'
defineEmits<{ close: [] }>()
const version = ref(''),
  latest = ref(''),
  notes = ref(''),
  releaseUrl = ref('https://cnb.cool/wymix.top/nav/-/releases'),
  error = ref(''),
  checking = ref(false)
const abort = new AbortController()
async function check() {
  if (checking.value) return
  checking.value = true
  error.value = ''
  try {
    const data = await apiJson<{ tag_name: string; body: string; html_url: string }>(
      '/system/latest-release',
      { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]) },
    )
    latest.value = data.tag_name
    notes.value = data.body
    releaseUrl.value = data.html_url
  } catch (e) {
    if (!abort.signal.aborted) error.value = (e as Error).message
  } finally {
    checking.value = false
  }
}
onMounted(async () => {
  try {
    version.value = (
      await apiJson<{ version: string }>('/system/version', { signal: abort.signal })
    ).version
  } catch {
    error.value = '无法获取当前版本'
  }
})
onUnmounted(() => abort.abort())
</script>
<template>
  <ModalShell label="关于 Nav" @close="$emit('close')">
    <div class="about-panel">
      <h3>关于 Nav</h3>
      <p>当前版本：{{ version || '未知' }}</p>
      <p>个人导航仪表盘，支持网格、无限画布、隔离插件及离线保存。</p>
      <p>
        <a href="https://github.com/wymix-tech/Nav" target="_blank" rel="noopener noreferrer"
          >项目仓库</a
        >
        ·
        <a href="https://cnb.cool/wymix.top/nav" target="_blank" rel="noopener noreferrer"
          >CNB 镜像</a
        >
      </p>
      <button :disabled="checking" @click="check">{{ checking ? '检查中…' : '检查更新' }}</button>
      <p v-if="latest">最新发布：{{ latest }}</p>
      <pre v-if="notes">{{ notes }}</pre>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="latest">
        <a :href="releaseUrl" target="_blank" rel="noopener noreferrer">查看发布说明</a>
      </p>
      <button @click="$emit('close')">关闭</button>
    </div>
  </ModalShell>
</template>
<style scoped>
@layer nav-components {
  .about-panel {
    width: min(600px, calc(100vw - 32px));
    padding: 24px;
    display: grid;
    gap: 16px;
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 40dvh;
    overflow: auto;
  }
  a {
    color: var(--accent);
  }
  button {
    padding: 8px;
  }
}
</style>
