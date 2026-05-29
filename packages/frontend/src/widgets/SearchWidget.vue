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
const engines: Record<string, { url: string; label: string }> = {
  google: { url: 'https://www.google.com/search?q=', label: 'Google' },
  bing: { url: 'https://www.bing.com/search?q=', label: 'Bing' },
  baidu: { url: 'https://www.baidu.com/s?wd=', label: '百度' },
  duckduckgo: { url: 'https://duckduckgo.com/?q=', label: 'DDG' },
}

const currentEngine = ref(props.config.engine ?? 'google')
const showEngines = ref(false)

function search() {
  if (!query.value.trim()) return
  const engine = engines[currentEngine.value] ?? engines.google
  window.open(engine.url + encodeURIComponent(query.value), '_blank')
}

function switchEngine(name: string) {
  currentEngine.value = name
  emit('update:config', { ...props.config, engine: name })
  showEngines.value = false
}
</script>

<template>
  <div class="search-widget">
    <form @submit.prevent="search" class="search-bar">
      <button
        type="button"
        class="engine-toggle"
        :disabled="editing"
        @click.stop="showEngines = !showEngines"
        title="切换搜索引擎"
      >
        <svg viewBox="0 0 6 16" width="6" height="16" fill="currentColor">
          <circle cx="3" cy="3" r="1.5"/>
          <circle cx="3" cy="8" r="1.5"/>
          <circle cx="3" cy="13" r="1.5"/>
        </svg>
      </button>

      <input
        v-model="query"
        type="text"
        :placeholder="engines[currentEngine]?.label + ' 搜索...'"
        class="search-input"
        :disabled="editing"
      />

      <button type="submit" class="search-btn" :disabled="editing" title="搜索">
        <svg viewBox="3 3 17 17" width="36" height="36" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="6.5"/>
          <path d="m19.5 19.5-4.5-4.5"/>
        </svg>
      </button>
    </form>

    <!-- 引擎切换条 -->
    <Transition name="slide">
      <div v-if="showEngines && !editing" class="engine-bar">
        <button
          v-for="(engine, name) in engines"
          :key="name"
          :class="['engine-chip', { active: currentEngine === name }]"
          @click="switchEngine(name as string)"
        >
          {{ engine.label }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.search-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
  gap: 10px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 4px 4px 4px 4px;
  transition: border-color 0.3s, box-shadow 0.3s;
}

.search-bar:focus-within {
  border-color: rgba(96, 165, 250, 0.3);
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.1);
}

.engine-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 32px;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.engine-toggle:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}

.search-input {
  flex: 1;
  min-width: 0;
  padding: 10px 8px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 15px;
  outline: none;
}

.search-input::placeholder {
  color: var(--text-muted);
  font-size: 14px;
}

.search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  border: none;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.search-btn svg {
  width: 32px !important;
  height: 32px !important;
  flex-shrink: 0;
}

.search-btn:hover {
  color: var(--accent);
  background: rgba(96, 165, 250, 0.08);
}

.search-btn:active {
  transform: scale(0.92);
}

/* 引擎切换条 */
.engine-bar {
  display: flex;
  gap: 4px;
}

.engine-chip {
  flex: 1;
  padding: 6px 0;
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-muted);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}

.engine-chip:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  border-color: rgba(255, 255, 255, 0.08);
}

.engine-chip.active {
  background: rgba(96, 165, 250, 0.12);
  color: var(--accent);
  border-color: rgba(96, 165, 250, 0.2);
}

/* 滑入动画 */
.slide-enter-active {
  transition: opacity 0.2s, max-height 0.25s;
}
.slide-leave-active {
  transition: opacity 0.15s, max-height 0.2s;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}
</style>
