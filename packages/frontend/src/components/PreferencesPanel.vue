<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDashboardStore } from '../stores/dashboardStore'
import type { DashboardBackground, BackgroundImage } from '@nav/shared'

const dashboardStore = useDashboardStore()

const emit = defineEmits<{
  close: []
}>()

const title = ref(dashboardStore.dashboard?.title ?? 'Nav - 个人导航页')
const bgMode = ref<'color' | 'image' | 'slideshow'>(
  dashboardStore.dashboard?.background?.mode ?? 'color'
)
const bgColor = ref(dashboardStore.dashboard?.background?.color ?? '#0c1021')
const bgImages = ref<BackgroundImage[]>(dashboardStore.dashboard?.background?.images ?? [])
const slideshowInterval = ref(dashboardStore.dashboard?.background?.interval ?? 30)
const newImageUrl = ref('')

// 监听标题变化，实时更新 document.title
watch(title, (val) => {
  document.title = val || 'Nav - 个人导航页'
})

function handleImageUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    bgImages.value.push({
      type: 'upload',
      src: reader.result as string,
      name: file.name,
    })
  }
  reader.readAsDataURL(file)
  input.value = ''
}

function addImageUrl() {
  const url = newImageUrl.value.trim()
  if (!url) return
  bgImages.value.push({ type: 'url', src: url })
  newImageUrl.value = ''
}

function removeImage(index: number) {
  bgImages.value.splice(index, 1)
}

function save() {
  if (!dashboardStore.dashboard) return
  dashboardStore.dashboard.title = title.value
  dashboardStore.dashboard.background = {
    mode: bgMode.value,
    color: bgColor.value,
    images: bgImages.value,
    interval: slideshowInterval.value,
    index: 0,
  }
  dashboardStore.save()
  emit('close')
}

function cancel() {
  emit('close')
}
</script>

<template>
  <div class="prefs-overlay" @click.self="cancel">
    <div class="prefs-panel">
      <div class="prefs-header">
        <h3>偏好设置</h3>
        <button class="close-btn" @click="cancel">✕</button>
      </div>

      <!-- 页面标题 -->
      <div class="prefs-section">
        <label class="prefs-label">页面标题</label>
        <input
          v-model="title"
          type="text"
          class="prefs-input"
          placeholder="Nav - 个人导航页"
        />
      </div>

      <!-- 背景模式 -->
      <div class="prefs-section">
        <label class="prefs-label">页面背景</label>
        <div class="mode-tabs">
          <button
            :class="['mode-tab', { active: bgMode === 'color' }]"
            @click="bgMode = 'color'"
          >纯色</button>
          <button
            :class="['mode-tab', { active: bgMode === 'image' }]"
            @click="bgMode = 'image'"
          >图片</button>
          <button
            :class="['mode-tab', { active: bgMode === 'slideshow' }]"
            @click="bgMode = 'slideshow'"
          >轮播</button>
        </div>
      </div>

      <!-- 纯色模式 -->
      <div v-if="bgMode === 'color'" class="prefs-section">
        <label class="prefs-label">背景色</label>
        <div class="color-row">
          <input v-model="bgColor" type="color" class="color-picker" />
          <input v-model="bgColor" type="text" class="prefs-input color-text" />
        </div>
      </div>

      <!-- 图片/轮播模式 -->
      <template v-if="bgMode === 'image' || bgMode === 'slideshow'">
        <div class="prefs-section">
          <label class="prefs-label">添加图片</label>
          <div class="image-actions">
            <label class="upload-btn">
              <input type="file" accept="image/*" @change="handleImageUpload" hidden />
              <span>+ 上传图片</span>
            </label>
            <div class="url-row">
              <input
                v-model="newImageUrl"
                type="text"
                class="prefs-input"
                placeholder="输入图片 URL..."
                @keyup.enter="addImageUrl"
              />
              <button class="add-url-btn" @click="addImageUrl">添加</button>
            </div>
          </div>
        </div>

        <!-- 图片列表 -->
        <div v-if="bgImages.length > 0" class="prefs-section">
          <label class="prefs-label">图片列表（{{ bgImages.length }}）</label>
          <div class="image-list">
            <div v-for="(img, i) in bgImages" :key="i" class="image-item">
              <div class="image-thumb" :style="{ backgroundImage: `url(${img.src})` }"></div>
              <span class="image-name">{{ img.name || `图片 ${i + 1}` }}</span>
              <button class="remove-btn" @click="removeImage(i)">✕</button>
            </div>
          </div>
        </div>

        <!-- 轮播间隔 -->
        <div v-if="bgMode === 'slideshow'" class="prefs-section">
          <label class="prefs-label">轮播间隔</label>
          <div class="interval-row">
            <input
              v-model.number="slideshowInterval"
              type="range"
              min="5"
              max="120"
              step="5"
              class="interval-slider"
            />
            <span class="interval-value">{{ slideshowInterval }} 秒</span>
          </div>
        </div>
      </template>

      <!-- 操作按钮 -->
      <div class="prefs-actions">
        <button class="prefs-btn cancel" @click="cancel">取消</button>
        <button class="prefs-btn save" @click="save">保存</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.prefs-overlay {
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

.prefs-panel {
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
  overflow-y: auto;
}

.prefs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.prefs-header h3 {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
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

.prefs-section {
  margin-bottom: 20px;
}

.prefs-label {
  display: block;
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.prefs-input {
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.prefs-input:focus {
  border-color: rgba(96, 165, 250, 0.3);
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.1);
}

.mode-tabs {
  display: flex;
  gap: 6px;
}

.mode-tab {
  flex: 1;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  transition: all 0.2s;
}

.mode-tab:hover {
  background: rgba(255, 255, 255, 0.08);
}

.mode-tab.active {
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  color: white;
  border-color: transparent;
  box-shadow: 0 2px 8px rgba(96, 165, 250, 0.25);
}

.color-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.color-picker {
  width: 44px;
  height: 44px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  cursor: pointer;
  background: none;
  padding: 0;
}

.color-picker::-webkit-color-swatch-wrapper { padding: 2px; }
.color-picker::-webkit-color-swatch { border-radius: 6px; border: none; }

.color-text {
  flex: 1;
}

.image-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(96, 165, 250, 0.3);
  color: var(--accent);
}

.url-row {
  display: flex;
  gap: 8px;
}

.url-row .prefs-input {
  flex: 1;
}

.add-url-btn {
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  white-space: nowrap;
}

.add-url-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.image-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.image-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
}

.image-thumb {
  width: 48px;
  height: 32px;
  border-radius: 6px;
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
}

.image-name {
  flex: 1;
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
}

.remove-btn:hover {
  color: var(--danger);
  background: rgba(248, 113, 113, 0.12);
}

.interval-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.interval-slider {
  flex: 1;
  -webkit-appearance: none;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  outline: none;
}

.interval-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(96, 165, 250, 0.3);
}

.interval-value {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-secondary);
  min-width: 50px;
  text-align: right;
}

.prefs-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.prefs-btn {
  padding: 10px 24px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 12px;
  transition: all 0.2s;
}

.prefs-btn.cancel {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.prefs-btn.cancel:hover {
  background: rgba(255, 255, 255, 0.1);
}

.prefs-btn.save {
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  color: white;
  box-shadow: 0 2px 8px rgba(96, 165, 250, 0.25);
}

.prefs-btn.save:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(96, 165, 250, 0.35);
}
</style>
