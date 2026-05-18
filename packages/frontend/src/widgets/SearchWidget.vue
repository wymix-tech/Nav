<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  config: Record<string, any>
  editing: boolean
  editable: boolean
}>()

const emit = defineEmits<{
  'update:config': [value: Record<string, any>]
}>()

const query = ref('')
const engines: Record<string, string> = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  baidu: 'https://www.baidu.com/s?wd=',
  duckduckgo: 'https://duckduckgo.com/?q=',
}

const currentEngine = ref(props.config.engine ?? 'google')

function search() {
  if (!query.value.trim()) return
  const url = (engines[currentEngine.value] ?? engines.google) + encodeURIComponent(query.value)
  window.open(url, '_blank')
}

function switchEngine(engine: string) {
  currentEngine.value = engine
  emit('update:config', { ...props.config, engine })
}
</script>

<template>
  <div class="search-widget">
    <form @submit.prevent="search" class="search-form">
      <input
        v-model="query"
        type="text"
        placeholder="搜索..."
        class="search-input"
        :disabled="editing"
      />
      <button type="submit" class="search-btn" :disabled="editing">搜索</button>
    </form>
    <div class="engine-list">
      <button
        v-for="(url, name) in engines"
        :key="name"
        :class="['engine-btn', { active: currentEngine === name }]"
        @click="switchEngine(name as string)"
      >
        {{ name }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.search-widget {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  justify-content: center;
}

.search-form {
  display: flex;
  gap: 8px;
}

.search-input {
  flex: 1;
  padding: 10px 16px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-size: 15px;
  outline: none;
}

.search-input:focus {
  border-color: var(--accent);
}

.search-btn {
  padding: 10px 20px;
  background-color: var(--accent);
  color: white;
  font-size: 14px;
}

.engine-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.engine-btn {
  padding: 4px 10px;
  font-size: 12px;
  background-color: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
}

.engine-btn.active {
  background-color: var(--accent);
  color: white;
  border-color: var(--accent);
}
</style>
