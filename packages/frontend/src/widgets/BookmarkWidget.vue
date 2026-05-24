<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  config: Record<string, any>
  editing: boolean
  editable: boolean
}>()

const emit = defineEmits<{
  'update:config': [value: Record<string, any>]
}>()

interface Bookmark {
  title: string
  url: string
  icon?: string
}

interface BookmarkGroup {
  name: string
  bookmarks: Bookmark[]
}

const showConfig = ref(false)
const editingGroups = ref<BookmarkGroup[]>([])

const groups = computed<BookmarkGroup[]>(() => props.config.groups ?? [])
const isEmpty = computed(() => groups.value.length === 0 || groups.value.every((g) => g.bookmarks.length === 0))

function getFavicon(url: string): string {
  try {
    const domain = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  } catch {
    return ''
  }
}

function openConfig() {
  editingGroups.value = JSON.parse(JSON.stringify(groups.value))
  if (editingGroups.value.length === 0) {
    editingGroups.value.push({ name: '默认', bookmarks: [] })
  }
  showConfig.value = true
}

function addGroup() {
  editingGroups.value.push({ name: '', bookmarks: [] })
}

function removeGroup(index: number) {
  editingGroups.value.splice(index, 1)
}

function addBookmark(groupIndex: number) {
  editingGroups.value[groupIndex].bookmarks.push({ title: '', url: '' })
}

function removeBookmark(groupIndex: number, bmIndex: number) {
  editingGroups.value[groupIndex].bookmarks.splice(bmIndex, 1)
}

function saveConfig() {
  const validGroups = editingGroups.value
    .filter((g) => g.name.trim() || g.bookmarks.length > 0)
    .map((g) => ({
      name: g.name.trim() || '未命名',
      bookmarks: g.bookmarks.filter((b) => b.title.trim() && b.url.trim()),
    }))
  emit('update:config', { ...props.config, groups: validGroups })
  showConfig.value = false
}
</script>

<template>
  <div class="bookmark-widget">
    <!-- 配置表单 -->
    <template v-if="showConfig">
      <div class="config-form">
        <div v-for="(group, gi) in editingGroups" :key="gi" class="config-group">
          <div class="config-group-header">
            <input
              v-model="group.name"
              type="text"
              placeholder="分组名称"
              class="config-input group-name-input"
            />
            <button class="config-icon-btn" @click="removeGroup(gi)">✕</button>
          </div>
          <div v-for="(bm, bmi) in group.bookmarks" :key="bmi" class="config-bookmark-row">
            <input v-model="bm.title" type="text" placeholder="标题" class="config-input" />
            <input v-model="bm.url" type="text" placeholder="https://..." class="config-input" />
            <button class="config-icon-btn" @click="removeBookmark(gi, bmi)">✕</button>
          </div>
          <button class="config-add-btn" @click="addBookmark(gi)">+ 添加书签</button>
        </div>
        <div class="config-actions">
          <button class="config-btn add-group" @click="addGroup">+ 添加分组</button>
          <div class="config-actions-right">
            <button class="config-btn cancel" @click="showConfig = false">取消</button>
            <button class="config-btn save" @click="saveConfig">保存</button>
          </div>
        </div>
      </div>
    </template>
    <!-- 空状态：点击配置 -->
    <template v-else-if="isEmpty && editable">
      <div class="empty-config" @click="openConfig">
        <div class="empty-icon">📑</div>
        <div class="empty-text">点击配置添加书签</div>
      </div>
    </template>
    <!-- 空状态：只读 -->
    <template v-else-if="isEmpty">
      <div class="empty">暂无书签</div>
    </template>
    <!-- 书签列表 -->
    <template v-else>
      <div v-if="editing && editable" class="edit-hint" @click="openConfig">⚙ 配置</div>
      <template v-for="(group, gi) in groups" :key="gi">
        <div v-if="group.bookmarks.length > 0" class="group">
          <div class="group-name">{{ group.name }}</div>
          <div class="bookmarks">
            <a
              v-for="bm in group.bookmarks"
              :key="bm.url"
              :href="editing ? undefined : bm.url"
              :target="editing ? undefined : '_blank'"
              class="bookmark-item"
              :class="{ 'no-link': editing }"
            >
              <img
                :src="bm.icon || getFavicon(bm.url)"
                :alt="bm.title"
                class="bookmark-icon"
                @error="($event.target as HTMLImageElement).style.display = 'none'"
              />
              <span class="bookmark-title">{{ bm.title }}</span>
            </a>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.bookmark-widget {
  overflow-y: auto;
  height: 100%;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  font-size: 13px;
}

.empty-config {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.empty-config:hover {
  opacity: 1;
}

.empty-icon {
  font-size: 24px;
}

.empty-text {
  font-size: 13px;
  color: var(--text-secondary);
}

.edit-hint {
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: right;
  padding: 2px 4px;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.edit-hint:hover {
  opacity: 1;
}

.group {
  margin-bottom: 10px;
}

.group:last-child {
  margin-bottom: 0;
}

.group-name {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 6px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.bookmarks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bookmark-item {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  background-color: var(--bg-primary);
  border-radius: 6px;
  text-decoration: none;
  color: var(--text-primary);
  font-size: 13px;
  transition: background-color 0.15s ease;
}

.bookmark-item:not(.no-link):hover {
  background-color: var(--accent);
}

.bookmark-icon {
  width: 16px;
  height: 16px;
  border-radius: 2px;
}

.bookmark-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}

/* 配置表单 */
.config-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  padding: 4px;
  overflow-y: auto;
  max-height: 100%;
}

.config-group {
  background-color: var(--bg-primary);
  border-radius: var(--radius);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.config-group-header {
  display: flex;
  gap: 6px;
  align-items: center;
}

.group-name-input {
  font-weight: 600;
}

.config-bookmark-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.config-input {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background-color: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
}

.config-input:focus {
  border-color: var(--accent);
}

.config-icon-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  padding: 0;
  background: transparent;
  color: var(--text-secondary);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
}

.config-icon-btn:hover {
  color: #ef4444;
}

.config-add-btn {
  font-size: 12px;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  padding: 2px 0;
}

.config-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.config-actions-right {
  display: flex;
  gap: 6px;
}

.config-btn {
  padding: 5px 12px;
  border-radius: var(--radius);
  border: none;
  font-size: 12px;
  cursor: pointer;
}

.config-btn.add-group {
  background: none;
  color: var(--accent);
}

.config-btn.cancel {
  background-color: var(--bg-primary);
  color: var(--text-secondary);
}

.config-btn.save {
  background-color: var(--accent);
  color: white;
}
</style>
