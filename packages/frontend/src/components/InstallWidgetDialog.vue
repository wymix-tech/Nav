<script setup lang="ts">
import { ref } from 'vue'
import ModalShell from './ModalShell.vue'
import { validateInstalled } from '@nav/shared'
import { useWidgetStore } from '../stores/widgetStore'
import type { InstalledWidget, WidgetManifest } from '@nav/shared'

const widgetStore = useWidgetStore()
const repoUrl = ref('')
const loading = ref(false)
const error = ref('')
const preview = ref<WidgetManifest | null>(null)

const emit = defineEmits<{
  close: []
}>()

const candidate = ref<InstalledWidget | null>(null),
  approved = ref(false)
function parseRepoUrl(value: string) {
  try {
    const url = new URL(value)
    const bits = url.pathname
      .replace(/\.git$/, '')
      .split('/')
      .filter(Boolean)
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'github.com' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      bits.length !== 2 ||
      bits.some((x) => !/^[-\w.]+$/.test(x))
    )
      return null
    return { owner: bits[0], repo: bits[1] }
  } catch {
    return null
  }
}
async function handlePreview() {
  const parsed = parseRepoUrl(repoUrl.value)
  if (!parsed) {
    error.value = '请输入完整 HTTPS GitHub 仓库地址'
    return
  }
  loading.value = true
  error.value = ''
  approved.value = false
  try {
    const info = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/commits`,
      { signal: AbortSignal.timeout(10000) },
    )
    if (!info.ok) throw new Error('无法解析仓库提交')
    const commits = await info.json()
    const commit = commits[0]?.sha
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('无法解析固定提交')
    const res = await fetch(
      `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${commit}/manifest.json`,
      { signal: AbortSignal.timeout(10000) },
    )
    if (!res.ok) throw new Error('无法读取 manifest.json')
    const manifest = await res.json()
    const installed = {
      widgetId: manifest.name,
      manifest,
      commit,
      cdnUrl: `https://cdn.jsdelivr.net/gh/${parsed.owner}/${parsed.repo}@${commit}/${manifest.entry}`,
      installedAt: new Date().toISOString(),
    }
    validateInstalled(installed)
    candidate.value = installed
    preview.value = manifest
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
async function handleInstall() {
  if (!candidate.value || !approved.value) return
  loading.value = true
  error.value = ''
  try {
    await widgetStore.install(candidate.value)
    emit('close')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <ModalShell label="安装组件" @close="emit('close')">
    <div class="dialog">
      <h2>安装组件</h2>
      <div v-if="!preview">
        <input
          v-model="repoUrl"
          type="text"
          placeholder="输入 GitHub 仓库地址，如 https://github.com/user/widget"
          class="input"
          autofocus
        />
        <p v-if="error" class="error">{{ error }}</p>
        <div class="actions">
          <button @click="emit('close')">取消</button>
          <button class="primary" :disabled="loading" @click="handlePreview">
            {{ loading ? '获取中...' : '预览' }}
          </button>
        </div>
      </div>
      <div v-else>
        <div class="preview">
          <div class="preview-row"><strong>名称：</strong>{{ preview.displayName }}</div>
          <div class="preview-row"><strong>版本：</strong>{{ preview.version }}</div>
          <div class="preview-row"><strong>作者：</strong>{{ preview.author }}</div>
          <div class="preview-row"><strong>描述：</strong>{{ preview.description }}</div>
        </div>
        <label
          ><input v-model="approved" type="checkbox" />允许安装此固定版本插件，网络来源：{{
            preview.networkOrigins?.join(', ') || '不允许网络请求'
          }}</label
        >
        <p v-if="error" class="error">{{ error }}</p>
        <div class="actions">
          <button @click="preview = null">返回</button>
          <button class="primary" :disabled="loading || !approved" @click="handleInstall">
            {{ loading ? '安装中...' : '安装' }}
          </button>
        </div>
      </div>
    </div>
  </ModalShell>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.dialog {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  width: 480px;
}

.dialog h2 {
  margin-bottom: 16px;
  font-size: 18px;
}

.input {
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
}

.input:focus {
  border-color: var(--accent);
}

.error {
  color: #ef4444;
  font-size: 13px;
  margin-top: 8px;
}

.preview {
  margin-bottom: 16px;
}

.preview-row {
  padding: 6px 0;
  font-size: 14px;
  border-bottom: 1px solid var(--border);
}

.preview-row:last-child {
  border-bottom: none;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.actions button {
  padding: 8px 20px;
  font-size: 14px;
  background-color: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.actions button.primary {
  border: none;
}
</style>
