<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

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

async function fetchWeather() {
  const apiKey = props.config.apiKey
  const city = props.config.city ?? 'Beijing'
  if (!apiKey) {
    error.value = '请配置 API Key'
    return
  }
  loading.value = true
  try {
    const unit = props.config.unit === 'fahrenheit' ? 'imperial' : 'metric'
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=${unit}&lang=zh_cn`
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

onMounted(fetchWeather)
watch(() => [props.config.city, props.config.unit, props.config.apiKey], fetchWeather)
</script>

<template>
  <div class="weather-widget">
    <template v-if="error">
      <div class="error">{{ error }}</div>
    </template>
    <template v-else-if="weather">
      <img :src="weather.icon" :alt="weather.description" class="weather-icon" />
      <div class="temp">{{ weather.temp }}°</div>
      <div class="desc">{{ weather.description }}</div>
      <div class="city">{{ config.city ?? '北京' }}</div>
    </template>
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
</style>
