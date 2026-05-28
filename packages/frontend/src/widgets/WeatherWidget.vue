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
  gap: 4px;
}

.weather-icon {
  width: 56px;
  height: 56px;
}

.temp {
  font-family: var(--font-display);
  font-size: 36px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  background: linear-gradient(135deg, #e2e8f0, #94a3b8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.desc {
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--text-secondary);
}

.city {
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--text-muted);
}

.error {
  color: var(--danger);
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
  opacity: 0.5;
  transition: opacity 0.3s;
}

.config-prompt:hover {
  opacity: 0.9;
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
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.config-input:focus {
  border-color: rgba(96, 165, 250, 0.3);
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.1);
}

.config-actions {
  display: flex;
  gap: 8px;
}

.config-btn {
  flex: 1;
  padding: 8px;
  border-radius: 10px;
  border: none;
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.config-btn.cancel {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
}

.config-btn.cancel:hover {
  background: rgba(255, 255, 255, 0.1);
}

.config-btn.save {
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  color: white;
  box-shadow: 0 2px 8px rgba(96, 165, 250, 0.25);
}
</style>
