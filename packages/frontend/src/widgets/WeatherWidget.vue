<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'

const props = defineProps<{
  config: Record<string, any>
  editing: boolean
  editable: boolean
}>()

const emit = defineEmits<{
  'update:config': [value: Record<string, any>]
}>()

const weather = ref<{ temp: number; description: string; icon: string } | null>(null)
const error = ref('')
const loading = ref(false)
const showConfig = ref(false)

const apiKey = ref(props.config.apiKey ?? '')
const city = ref(props.config.city ?? '北京')
const unit = ref(props.config.unit ?? 'metric')

const needsConfig = computed(() => !props.config.apiKey)

async function fetchWeather() {
  const key = props.config.apiKey
  const c = props.config.city ?? '北京'
  if (!key) {
    error.value = '请配置 API Key'
    return
  }
  loading.value = true
  try {
    const u = props.config.unit === 'fahrenheit' ? 'imperial' : 'metric'
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(c)}&appid=${key}&units=${u}&lang=zh_cn`
    )
    if (!res.ok) throw new Error('请求失败')
    const data = await res.json()
    weather.value = {
      temp: Math.round(data.main.temp),
      description: data.weather[0].description,
      icon: `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`,
    }
    error.value = ''
  } catch (e: any) {
    error.value = e.message ?? '获取天气失败'
  } finally {
    loading.value = false
  }
}

function saveConfig() {
  emit('update:config', {
    ...props.config,
    apiKey: apiKey.value,
    city: city.value,
    unit: unit.value,
  })
  showConfig.value = false
}

onMounted(fetchWeather)
watch(() => [props.config.city, props.config.unit, props.config.apiKey], fetchWeather)
</script>

<template>
  <div class="weather-widget">
    <!-- 配置表单 -->
    <template v-if="showConfig">
      <div class="config-form">
        <input v-model="apiKey" type="text" placeholder="API Key" class="config-input" />
        <input v-model="city" type="text" placeholder="城市" class="config-input" />
        <select v-model="unit" class="config-input">
          <option value="metric">摄氏度</option>
          <option value="imperial">华氏度</option>
        </select>
        <div class="config-actions">
          <button class="config-btn cancel" @click="showConfig = false">取消</button>
          <button class="config-btn save" @click="saveConfig">保存</button>
        </div>
      </div>
    </template>
    <!-- 需要配置提示 -->
    <template v-else-if="needsConfig && editable">
      <div class="config-prompt" @click="showConfig = true">
        <div class="config-icon">⚙️</div>
        <div class="config-text">点击配置天气</div>
      </div>
    </template>
    <!-- 错误提示 -->
    <template v-else-if="error">
      <div class="error">{{ error }}</div>
    </template>
    <!-- 天气数据 -->
    <template v-else-if="weather">
      <img :src="weather.icon" :alt="weather.description" class="weather-icon" />
      <div class="temp">{{ weather.temp }}°</div>
      <div class="desc">{{ weather.description }}</div>
      <div class="city">{{ config.city ?? '北京' }}</div>
    </template>
    <!-- 加载中 -->
    <template v-else>
      <div class="loading">{{ loading ? '加载中...' : '未配置' }}</div>
    </template>
  </div>
</template>

<style scoped>
.weather-widget {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 2px;
}

.weather-icon {
  width: 56px;
  height: 56px;
}

.temp {
  font-size: 32px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: var(--text-primary);
}

.desc {
  font-size: 14px;
  color: var(--text-secondary);
}

.city {
  font-size: 12px;
  color: var(--text-secondary);
  opacity: 0.7;
}

.error {
  color: #ef4444;
  font-size: 13px;
  text-align: center;
  padding: 0 12px;
}

.loading {
  color: var(--text-secondary);
  font-size: 14px;
}

.config-prompt {
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

.config-prompt:hover {
  opacity: 1;
}

.config-icon {
  font-size: 24px;
}

.config-text {
  font-size: 13px;
  color: var(--text-secondary);
}

.config-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 8px;
}

.config-input {
  padding: 6px 10px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.config-input:focus {
  border-color: var(--accent);
}

.config-actions {
  display: flex;
  gap: 8px;
}

.config-btn {
  flex: 1;
  padding: 6px;
  border-radius: var(--radius);
  border: none;
  font-size: 13px;
  cursor: pointer;
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
