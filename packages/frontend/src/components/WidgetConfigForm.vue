<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  schema: Record<string, any>
  modelValue: Record<string, any>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>]
}>()

const formData = ref<Record<string, any>>({ ...props.modelValue })

watch(
  () => props.modelValue,
  (val) => { formData.value = { ...val } },
  { deep: true }
)

const fields = computed(() => {
  if (!props.schema?.properties) return []
  return Object.entries(props.schema.properties).map(([key, prop]: [string, any]) => ({
    key,
    title: prop.title ?? key,
    type: prop.type ?? 'string',
    enum: prop.enum,
    default: prop.default,
    required: (props.schema.required ?? []).includes(key),
  }))
})

function updateField(key: string, value: any) {
  formData.value[key] = value
  emit('update:modelValue', { ...formData.value })
}
</script>

<template>
  <form class="config-form" @submit.prevent>
    <div v-for="field in fields" :key="field.key" class="form-field">
      <label class="label">
        {{ field.title }}
        <span v-if="field.required" class="required">*</span>
      </label>

      <select
        v-if="field.enum"
        :value="formData[field.key] ?? field.default"
        @change="updateField(field.key, ($event.target as HTMLSelectElement).value)"
        class="input"
      >
        <option v-for="opt in field.enum" :key="opt" :value="opt">{{ opt }}</option>
      </select>

      <input
        v-else-if="field.type === 'number'"
        type="number"
        :value="formData[field.key] ?? field.default"
        @input="updateField(field.key, Number(($event.target as HTMLInputElement).value))"
        class="input"
      />

      <input
        v-else-if="field.type === 'boolean'"
        type="checkbox"
        :checked="formData[field.key] ?? field.default"
        @change="updateField(field.key, ($event.target as HTMLInputElement).checked)"
      />

      <input
        v-else
        type="text"
        :value="formData[field.key] ?? field.default ?? ''"
        @input="updateField(field.key, ($event.target as HTMLInputElement).value)"
        class="input"
      />
    </div>
  </form>
</template>

<style scoped>
.config-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.required {
  color: #ef4444;
}

.input {
  padding: 8px 12px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
}

.input:focus {
  border-color: var(--accent);
}
</style>
