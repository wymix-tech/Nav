<script setup lang="ts">
import { computed } from 'vue'

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

const groups = computed<BookmarkGroup[]>(() => props.config.groups ?? [])

function getFavicon(url: string): string {
  try {
    const domain = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  } catch {
    return ''
  }
}
</script>

<template>
  <div class="bookmark-widget">
    <div v-if="groups.length === 0" class="empty">
      <span v-if="editable && editing">点击配置添加书签</span>
      <span v-else>暂无书签</span>
    </div>
    <div v-for="group in groups" :key="group.name" class="group">
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
</style>
