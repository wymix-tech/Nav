<script setup lang="ts">
import { ref, onMounted } from 'vue'

const emit = defineEmits<{
  close: []
}>()

const appVersion = ref('0.1.0')
const authorName = 'wymix'
const repoUrl = 'https://cnb.cool/wymix.top/nav'
const dockerRegistry = 'ghcr.io/wymix/nav'
const changelog = ref<string[]>([])
const checkingUpdate = ref(false)
const hasUpdate = ref<boolean | null>(null)
const latestVersion = ref('')
const updateError = ref(false)

onMounted(async () => {
  await Promise.allSettled([fetchCurrentVersion(), fetchLatestRelease()])
})

// 解析 semver 字符串为可比较的数字数组
function parseSemver(v: string): number[] {
  const clean = v.replace(/^v/, '')
  return clean.split('.').map(Number)
}

function isNewer(a: string, b: string): boolean {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na > nb) return true
    if (na < nb) return false
  }
  return false
}

async function fetchCurrentVersion() {
  try {
    const res = await fetch('/api/system/version', { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return
    const data = await res.json()
    if (data.version) appVersion.value = data.version
  } catch { /* 保持默认版本号 */ }
}

async function fetchLatestRelease() {
  try {
    const res = await fetch('/api/system/latest-release', { signal: AbortSignal.timeout(8000) })
    if (!res.ok) { setStaticChangelog(); return }
    const data = await res.json()
    latestVersion.value = data.tag_name || ''
    changelog.value = parseReleaseBody(data.body || '')
  } catch {
    setStaticChangelog()
  }
}

function parseReleaseBody(body: string): string[] {
  const fallback = setStaticChangelog()
  const lines: string[] = []
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('### ')) continue
    const clean = line
      .replace(/\[\[`([^`]+)`\]\([^)]+\)\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^\*\*-\*\*\s*/, '')
      .trim()
    if (clean) lines.push(clean)
  }
  return lines.length > 0 ? lines : fallback
}

function setStaticChangelog(): string[] {
  const fallback = [
    '支持自定义仪表盘布局与组件',
    '支持第三方组件安装与扩展',
    '支持图片与轮播背景',
    '支持本地离线使用与后端同步',
  ]
  if (changelog.value.length === 0) changelog.value = fallback
  return fallback
}

async function checkUpdate() {
  if (checkingUpdate.value) return
  checkingUpdate.value = true
  hasUpdate.value = null
  updateError.value = false
  try {
    const res = await fetch('/api/system/latest-release', { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error('无法获取版本信息')
    const data = await res.json()
    latestVersion.value = data.tag_name || ''
    hasUpdate.value = !!(latestVersion.value && isNewer(latestVersion.value, appVersion.value))
  } catch {
    updateError.value = true
    hasUpdate.value = null
  } finally {
    checkingUpdate.value = false
  }
}

function openUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <Teleport to="body">
  <div class="about-overlay" @click.self="emit('close')">
    <div class="about-panel">
      <div class="about-header">
        <h3>关于 INFI.NAV</h3>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="about-body">
        <!-- 项目名称与版本 -->
        <div class="about-section">
          <div class="about-brand">
            <span class="brand-name">INFI.NAV</span>
            <span class="brand-version">{{ appVersion }}</span>
          </div>
          <p class="brand-desc">个人导航页 — 可定制的仪表盘启动页</p>
        </div>

        <!-- 基本信息 -->
        <div class="about-section">
          <label class="about-label">基本信息</label>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-key">版本</span>
              <span class="info-value">{{ appVersion }}</span>
            </div>
            <div class="info-item">
              <span class="info-key">作者</span>
              <span class="info-value">{{ authorName }}</span>
            </div>
          </div>
        </div>

        <!-- 相关链接 -->
        <div class="about-section">
          <label class="about-label">相关链接</label>
          <div class="link-list">
            <button class="link-item" @click="openUrl(repoUrl)">
              <span class="link-icon">&#9733;</span>
              <span class="link-text">开源仓库</span>
              <span class="link-arrow">→</span>
            </button>
            <button class="link-item" @click="openUrl(`https://${dockerRegistry}`)">
              <span class="link-icon">⬡</span>
              <span class="link-text">Docker 制品库</span>
              <span class="link-arrow">→</span>
            </button>
          </div>
        </div>

        <!-- 更新检查 -->
        <div class="about-section">
          <label class="about-label">版本更新</label>
          <div class="update-area">
            <button
              class="update-btn"
              :disabled="checkingUpdate"
              @click="checkUpdate"
            >
              {{ checkingUpdate ? '检查中...' : '检查更新' }}
            </button>

            <div v-if="hasUpdate === true" class="update-info has-update">
              发现新版本 {{ latestVersion }}，请前往开源仓库下载更新。
            </div>
            <div v-else-if="hasUpdate === false" class="update-info is-latest">
              当前已是最新版本。
            </div>
            <div v-else-if="updateError" class="update-info error">
              无法获取更新信息，请稍后重试。
            </div>
          </div>
        </div>

        <!-- 更新说明 -->
        <div class="about-section">
          <label class="about-label">更新说明</label>
          <ul class="changelog-list">
            <li v-for="(item, i) in changelog" :key="i" class="changelog-item">
              {{ item }}
            </li>
          </ul>
        </div>
      </div>

      <div class="about-footer">
        <span class="footer-text">INFI.NAV — 无限导航，无限可能</span>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
.about-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.about-panel {
  width: 90%;
  max-width: 420px;
  max-height: 85vh;
  background: var(--glass-bg);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
}

.about-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.about-header h3 {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.about-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  padding-right: 4px;
}

.about-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 品牌区 */
.about-brand {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.brand-name {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.brand-version {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text-secondary);
  background: rgba(96, 165, 250, 0.1);
  padding: 2px 10px;
  border-radius: 10px;
}

.brand-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* 标签 */
.about-label {
  display: block;
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* 信息网格 */
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.info-item {
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-key {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

/* 链接列表 */
.link-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.link-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  color: var(--text-primary);
  font-size: 14px;
  text-align: left;
  transition: all 0.2s;
}

.link-item:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(96, 165, 250, 0.2);
}

.link-icon {
  font-size: 16px;
  color: var(--accent);
  flex-shrink: 0;
}

.link-text {
  flex: 1;
  font-weight: 500;
}

.link-arrow {
  color: var(--text-muted);
  font-size: 13px;
}

/* 更新检查 */
.update-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.update-btn {
  align-self: flex-start;
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 500;
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  color: white;
  border: none;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(96, 165, 250, 0.25);
  transition: all 0.2s;
}

.update-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(96, 165, 250, 0.35);
}

.update-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.update-info {
  font-size: 13px;
  padding: 10px 14px;
  border-radius: 10px;
  line-height: 1.5;
}

.update-info.has-update {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.2);
  color: var(--accent-warm);
}

.update-info.is-latest {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.update-info.error {
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.2);
  color: var(--danger);
}

/* 更新说明 */
.changelog-list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.changelog-item {
  padding: 8px 14px;
  font-size: 13px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  line-height: 1.5;
  position: relative;
  padding-left: 28px;
}

.changelog-item::before {
  content: '';
  position: absolute;
  left: 14px;
  top: 13px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
}

/* 底部 */
.about-footer {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  text-align: center;
}

.footer-text {
  font-size: 12px;
  color: var(--text-muted);
}
</style>
