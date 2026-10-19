<script setup lang="ts">
import { computed, ref, watch, onUnmounted, onMounted } from 'vue'
import {
  canvasSearchIndex,
  searchCanvas,
  type CanvasTypeNames,
  type Dashboard,
  type SelectionRef,
} from '@nav/shared'
const props = defineProps<{ dashboard: Dashboard; names: CanvasTypeNames }>()
const emit = defineEmits<{ locate: [ref: SelectionRef]; back: []; close: [] }>()
const query = ref(''),
  debounced = ref(''),
  index = ref(0),
  input = ref<HTMLInputElement | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
const entries = computed(() => canvasSearchIndex(props.dashboard, props.names)),
  results = computed(() => searchCanvas(entries.value, debounced.value))
watch(query, (value) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    debounced.value = value
    index.value = 0
  }, 120)
})
function keys(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    index.value = Math.max(
      0,
      Math.min(results.value.length - 1, index.value + (e.key === 'ArrowDown' ? 1 : -1)),
    )
  } else if (e.key === 'Enter' && results.value[index.value]) {
    e.preventDefault()
    emit('locate', results.value[index.value].ref)
  } else if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  }
}
onMounted(() => input.value?.focus())
onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>
<template>
  <div>
    <input
      ref="input"
      v-model="query"
      aria-label="搜索画布内容"
      placeholder="搜索名称、类型、书签…"
      maxlength="256"
      @keydown="keys"
    />
    <p>仅搜索此仪表盘已加载的公开字段</p>
    <ul aria-label="搜索结果">
      <li v-for="(r, i) in results" :key="r.ref.kind + r.ref.id">
        <button :class="{ active: i === index }" @click="emit('locate', r.ref)">
          {{ r.title }} <small>{{ r.type }}</small>
        </button>
      </li>
    </ul>
    <button @click="emit('back')">返回定位前视角</button>
  </div>
</template>
<style scoped>
input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--glass-border);
  border-radius: 6px;
}
ul {
  list-style: none;
  padding: 0;
}
button {
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--glass-border);
  padding: 6px;
  margin: 3px 0;
  text-align: left;
}
li button {
  width: 100%;
}
.active {
  outline: 1px solid var(--accent);
}
small,
p {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
