<script setup lang="ts">
import { ref } from 'vue'
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

function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

async function fetchManifest(owner: string, repo: string): Promise<WidgetManifest> {
  const branches = ['main', 'master']
  for (const branch of branches) {
    try {
      const res = await fetch(
        `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/manifest.json`
      )
      if (res.ok) return await res.json()
    } catch {}
  }
  throw new Error('无法获取 manifest.json，请确认仓库地址正确')
}

function validateManifest(m: any): m is WidgetManifest {
  return m && m.name && m.displayName && m.version && m.entry
}

async function handlePreview() {
  const parsed = parseRepoUrl(repoUrl.value)
  if (!parsed) {
    error.value = '请输入有效的 GitHub 仓库地址'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const manifest = await fetchManifest(parsed.owner, parsed.repo)
    if (!validateManifest(manifest)) {
      error.value = 'manifest.json 格式不正确'
      return
    }
    preview.value = manifest
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function handleInstall() {
  if (!preview.value) return
  const parsed = parseRepoUrl(repoUrl.value)!
  const cdnUrl = `https://cdn.jsdelivr.net/gh/${parsed.owner}/${parsed.repo}@${preview.value.version}/${preview.value.entry}`

  const installed: InstalledWidget = {
    widgetId: preview.value.name,
    manifest: preview.value,
    cdnUrl,
    installedAt: new Date().toISOString(),
  }
  await widgetStore.install(installed)
  emit('close')
}
</script>

<template>
  <div class="dialog-overlay" @click.self="emit('close')">
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
        <p v-if="error" class="error">{{ error }}</p>
        <div class="actions">
          <button @click="preview = null">返回</button>
          <button class="primary" :disabled="loading" @click="handleInstall">
            {{ loading ? '安装中...' : '安装' }}
          </button>
        </div>
      </div>
    </div>
  </div>
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

.dialog h2 { margin-bottom: 16px; font-size: 18px; }

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

.input:focus { border-color: var(--accent); }

.error { color: #ef4444; font-size: 13px; margin-top: 8px; }

.preview { margin-bottom: 16px; }

.preview-row {
  padding: 6px 0;
  font-size: 14px;
  border-bottom: 1px solid var(--border);
}

.preview-row:last-child { border-bottom: none; }

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

.actions button.primary { border: none; }
</style>
