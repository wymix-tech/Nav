<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { liveQuery } from 'dexie'
import { type Dashboard, type CanvasCamera } from '@nav/shared'
import { localMode } from '../../services/storageAdapter'
import { viewSpaceKey } from '../../canvas/viewPreferenceService'
import { changeNamedView, listNamedViews, type NamedView } from '../../canvas/namedViewService'
const props = defineProps<{ dashboard: Dashboard; camera: CanvasCamera }>()
const emit = defineEmits<{ navigate: [camera: CanvasCamera] }>()
const views = ref<NamedView[]>([]),
  error = ref(''),
  name = ref(''),
  key = ref(''),
  invalid = ref(0),
  renameId = ref(''),
  rename = ref('')
let ticket = 0,
  subscription: { unsubscribe: () => void } | undefined
watch(
  () => [props.dashboard.id, props.dashboard.instanceId],
  async () => {
    const n = ++ticket
    subscription?.unsubscribe()
    let space: string
    try {
      space = await viewSpaceKey(props.dashboard.instanceId, props.dashboard.id, localMode)
    } catch {
      if (n === ticket) {
        key.value = ''
        error.value = '空间身份无法保存'
      }
      return
    }
    if (n !== ticket) return
    key.value = space
    subscription = liveQuery(() => listNamedViews(space)).subscribe({
      next: (r) => {
        views.value = r.views
        invalid.value = r.invalid
      },
      error: () => (error.value = '无法读取本机视角'),
    })
  },
  { immediate: true },
)
async function action(a: Parameters<typeof changeNamedView>[1]) {
  try {
    await changeNamedView(key.value, a)
    error.value = ''
    name.value = ''
    renameId.value = ''
  } catch (e) {
    error.value =
      e instanceof Error && e.name === 'ConstraintError'
        ? '此空间已有同名视角'
        : e instanceof Error
          ? e.message
          : '视角未保存'
  }
}
function beginRename(v: NamedView) {
  renameId.value = v.id
  rename.value = v.name
}
async function jump(v: NamedView) {
  try {
    const latest = await listNamedViews(key.value),
      row = latest.views.find((r) => r.id === v.id)
    if (!row) {
      error.value = '视角已删除或无效'
      return
    }
    emit('navigate', row.camera)
  } catch {
    error.value = '无法读取本机视角'
  }
}
onUnmounted(() => {
  ticket++
  subscription?.unsubscribe()
})
</script>
<template>
  <div>
    <p>我的视角（此浏览器）</p>
    <form @submit.prevent="action({ type: 'create', name, camera })">
      <input v-model="name" aria-label="视角名称" placeholder="保存当前相机位置" /><button
        :disabled="!key || key.includes(':unconfirmed:')"
      >
        保存当前视角
      </button>
    </form>
    <p v-if="error" role="status">{{ error }}</p>
    <p v-if="invalid">{{ invalid }} 条无效或未来版本记录已保留</p>
    <ul>
      <li v-for="v in views" :key="v.id">
        <button @click="jump(v)">{{ v.name }}</button
        ><button @click="action({ type: 'update', id: v.id, revision: v.revision, camera })">
          按当前相机更新</button
        ><button @click="beginRename(v)">改名</button
        ><button @click="action({ type: 'delete', id: v.id, revision: v.revision })">
          删除视角
        </button>
        <form
          v-if="renameId === v.id"
          @submit.prevent="action({ type: 'rename', id: v.id, revision: v.revision, name: rename })"
        >
          <input v-model="rename" aria-label="新视角名称" /><button>保存名称</button>
        </form>
      </li>
    </ul>
    <p>视角不上传，不随文档导出。此浏览器的其他使用者可能看见这些记录。</p>
  </div>
</template>
<style scoped>
p {
  font-size: 12px;
  color: var(--text-muted);
}
ul {
  padding: 0;
  list-style: none;
}
li {
  border-top: 1px solid var(--glass-border);
  padding: 6px 0;
}
button,
input {
  padding: 5px;
  margin: 3px;
  font-size: 12px;
  border: 1px solid var(--glass-border);
  color: var(--text-primary);
  background: var(--bg-secondary);
  border-radius: 4px;
}
input {
  max-width: 95%;
}
</style>
