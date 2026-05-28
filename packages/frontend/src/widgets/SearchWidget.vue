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
  gap: 14px;
  height: 100%;
  justify-content: center;
}

.search-form {
  display: flex;
  gap: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 6px;
  transition: border-color 0.3s, box-shadow 0.3s;
}

.search-form:focus-within {
  border-color: rgba(96, 165, 250, 0.3);
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.1);
}

.search-input {
  flex: 1;
  padding: 12px 16px;
  border-radius: 12px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 15px;
  outline: none;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-btn {
  padding: 10px 28px;
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  color: white;
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(96, 165, 250, 0.3);
  transition: transform 0.15s, box-shadow 0.15s;
}

.search-btn:hover {
  transform: scale(1.03);
  box-shadow: 0 4px 16px rgba(96, 165, 250, 0.4);
}

.search-btn:active {
  transform: scale(0.97);
  box-shadow: 0 1px 4px rgba(96, 165, 250, 0.3);
}

.engine-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.engine-btn {
  padding: 6px 14px;
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 20px;
  transition: all 0.2s;
}

.engine-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.engine-btn.active {
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  color: white;
  border-color: transparent;
  box-shadow: 0 2px 8px rgba(96, 165, 250, 0.25);
}
</style>
