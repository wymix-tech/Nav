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

interface WeatherData {
  temp: number
  feelsLike: number
  description: string
  icon: string
  humidity: string
  windSpeed: string
  windDir: string
  uvIndex: string
  pressure: string
  visibility: string
  cloudCover: string
}

const weather = ref<WeatherData | null>(null)
const error = ref('')
const loading = ref(false)
const showConfig = ref(false)

const city = ref(props.config.city ?? 'Beijing')
const unit = ref(props.config.unit ?? 'metric')

const unitLabel = computed(() => (unit.value === 'imperial' ? 'F' : 'C'))

const weatherCode = computed(() => {
  if (!weather.value) return 'sunny'
  const desc = weather.value.description.toLowerCase()
  if (desc.includes('rain') || desc.includes('雨') || desc.includes('shower')) return 'rainy'
  if (desc.includes('snow') || desc.includes('雪')) return 'snowy'
  const cloud = Number(weather.value.cloudCover) || 0
  if (cloud > 60) return 'cloudy'
  if (cloud > 30) return 'partly-cloudy'
  return 'sunny'
})

async function fetchWeather() {
  const c = props.config.city ?? 'Beijing'
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(c)}?format=j1&lang=zh`)
    if (!res.ok) throw new Error(`请求失败 (${res.status})`)
    const data = await res.json()
    const current = data.current_condition[0]
    weather.value = {
      temp: unit.value === 'imperial' ? Math.round(Number(current.temp_F)) : Math.round(Number(current.temp_C)),
      feelsLike: unit.value === 'imperial' ? Math.round(Number(current.FeelsLikeF)) : Math.round(Number(current.FeelsLikeC)),
      description: current.weatherDesc[0].value,
      icon: '',
      humidity: current.humidity,
      windSpeed: current.windspeedKmph,
      windDir: current.winddir16Point,
      uvIndex: current.uvIndex,
      pressure: current.pressure,
      visibility: current.visibility,
      cloudCover: current.cloudcover,
    }
  } catch (e: any) {
    error.value = e.message ?? '获取天气失败'
    weather.value = null
  } finally {
    loading.value = false
  }
}

function saveConfig() {
  emit('update:config', { ...props.config, city: city.value, unit: unit.value })
  showConfig.value = false
}

onMounted(fetchWeather)
watch(() => [props.config.city, props.config.unit], fetchWeather)
</script>

<template>
  <div class="weather-widget">

    <!-- 配置表单 -->
    <template v-if="showConfig">
      <div class="cfg">
        <div class="cfg-lbl">城市</div>
        <input v-model="city" type="text" placeholder="城市名" class="cfg-inp" />
        <select v-model="unit" class="cfg-inp">
          <option value="metric">摄氏度</option>
          <option value="imperial">华氏度</option>
        </select>
        <div class="cfg-btns">
          <button class="cfg-btn no" @click="showConfig = false">取消</button>
          <button class="cfg-btn ok" @click="saveConfig">保存</button>
        </div>
      </div>
    </template>

    <!-- 配置入口 -->
    <template v-else-if="editable && !weather">
      <div class="prompt" @click="showConfig = true">
        <span class="prompt-icon">&#9881;</span>
        <span class="prompt-txt">点击配置城市</span>
      </div>
    </template>

    <!-- 错误 -->
    <template v-else-if="error">
      <div class="err">
        <span class="err-msg">{{ error }}</span>
        <span v-if="editable" class="err-retry" @click="fetchWeather">重试</span>
      </div>
    </template>

    <!-- 天气卡片 -->
    <template v-else-if="weather">
      <div class="wc" :class="'t-' + weatherCode">

        <!-- 装饰性背景图标 -->
        <div class="deco-icon">
          <!-- 晴天太阳装饰 -->
          <svg v-if="weatherCode === 'sunny'" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#FFF7E0" stop-opacity="0.5"/>
                <stop offset="60%" stop-color="#FFE082" stop-opacity="0.2"/>
                <stop offset="100%" stop-color="#FFD54F" stop-opacity="0"/>
              </radialGradient>
            </defs>
            <circle cx="140" cy="50" r="55" fill="url(#sunGlow)"/>
            <circle cx="150" cy="45" r="18" fill="rgba(255,245,220,0.35)"/>
          </svg>

          <!-- 多云装饰 -->
          <svg v-else-if="weatherCode === 'partly-cloudy'" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="145" cy="75" rx="48" ry="26" fill="rgba(255,255,255,0.12)"/>
            <ellipse cx="115" cy="68" rx="34" ry="20" fill="rgba(255,255,255,0.08)"/>
            <circle cx="85" cy="78" rx="24" fill="rgba(255,255,255,0.12)"/>
            <circle cx="135" cy="40" r="22" fill="rgba(255,245,180,0.15)"/>
          </svg>

          <!-- 阴天云装饰 -->
          <svg v-else-if="weatherCode === 'cloudy'" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="130" cy="80" rx="52" ry="28" fill="rgba(255,255,255,0.1)"/>
            <ellipse cx="95" cy="72" rx="36" ry="22" fill="rgba(255,255,255,0.07)"/>
            <circle cx="65" cy="84" rx="26" fill="rgba(255,255,255,0.1)"/>
          </svg>

          <!-- 雨天装饰 -->
          <svg v-else-if="weatherCode === 'rainy'" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="120" cy="58" rx="44" ry="24" fill="rgba(176,190,197,0.15)"/>
            <circle cx="78" cy="64" rx="22" fill="rgba(144,164,174,0.12)"/>
            <line x1="90" y1="92" x2="82" y2="118" stroke="rgba(100,181,246,0.15)" stroke-width="4" stroke-linecap="round"/>
            <line x1="118" y1="92" x2="110" y2="118" stroke="rgba(100,181,246,0.15)" stroke-width="4" stroke-linecap="round"/>
            <line x1="146" y1="92" x2="138" y2="118" stroke="rgba(100,181,246,0.15)" stroke-width="4" stroke-linecap="round"/>
          </svg>

          <!-- 雪天装饰 -->
          <svg v-else viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="120" cy="56" rx="44" ry="24" fill="rgba(176,190,197,0.13)"/>
            <circle cx="76" cy="62" rx="22" fill="rgba(144,164,174,0.1)"/>
            <circle cx="88" cy="98" r="5" fill="rgba(227,242,253,0.18)"/>
            <circle cx="118" cy="112" r="5" fill="rgba(227,242,253,0.16)"/>
            <circle cx="148" cy="96" r="5" fill="rgba(227,242,253,0.14)"/>
            <circle cx="103" cy="128" r="4" fill="rgba(227,242,253,0.12)"/>
          </svg>
        </div>

        <div class="body">
          <!-- 上半区 -->
          <div class="upper">
            <div class="left-col">
              <div class="city-row">
                <span class="city">{{ config.city ?? 'Beijing' }}</span>
                <span class="aqi-badge">{{ weather.uvIndex <= 2 ? '优' : weather.uvIndex <= 4 ? '良' : '一般' }}</span>
              </div>
              <div class="temp-row">
                <span class="temp-num">{{ weather.temp }}</span>
                <span class="temp-deg">°{{ unitLabel }}</span>
              </div>
              <div class="sub-row">{{ weather.description }} · 体感 {{ weather.feelsLike }}°</div>
            </div>

            <!-- 主图标 -->
            <div class="icon-wrap">
              <svg v-if="weatherCode === 'sunny'" class="wi" viewBox="0 0 100 100">
                <defs>
                  <radialGradient id="sunCore" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="#FFF59D"/>
                    <stop offset="100%" stop-color="#FFD54F"/>
                  </radialGradient>
                </defs>
                <circle cx="50" cy="46" r="18" fill="url(#sunCore)" opacity="0.95"/>
                <g stroke="#FFE082" stroke-width="3" stroke-linecap="round" opacity="0.8">
                  <line x1="50" y1="10" x2="50" y2="18"/><line x1="50" y1="74" x2="50" y2="82"/>
                  <line x1="14" y1="46" x2="22" y2="46"/><line x1="78" y1="46" x2="86" y2="46"/>
                  <line x1="23.4" y1="19.4" x2="29.1" y2="25.1"/><line x1="70.9" y1="66.9" x2="76.6" y2="72.6"/>
                  <line x1="23.4" y1="72.6" x2="29.1" y2="66.9"/><line x1="70.9" y1="25.1" x2="76.6" y2="19.4"/>
                </g>
              </svg>

              <svg v-else-if="weatherCode === 'partly-cloudy'" class="wi" viewBox="0 0 100 100">
                <circle cx="38" cy="38" r="14" fill="#FFE082" opacity="0.9"/>
                <ellipse cx="54" cy="62" rx="30" ry="17" fill="rgba(255,255,255,0.92)"/>
                <ellipse cx="40" cy="58" rx="20" ry="13" fill="rgba(245,245,245,0.85)"/>
                <circle cx="28" cy="63" r="13" fill="rgba(255,255,255,0.9)"/>
              </svg>

              <svg v-else-if="weatherCode === 'cloudy'" class="wi" viewBox="0 0 100 100">
                <ellipse cx="54" cy="58" rx="32" ry="18" fill="rgba(207,216,220,0.85)"/>
                <ellipse cx="38" cy="54" rx="22" ry="14" fill="rgba(176,190,197,0.8)"/>
                <circle cx="26" cy="60" r="15" fill="rgba(207,216,220,0.85)"/>
              </svg>

              <svg v-else-if="weatherCode === 'rainy'" class="wi" viewBox="0 0 100 100">
                <ellipse cx="50" cy="40" rx="30" ry="16" fill="rgba(144,164,174,0.85)"/>
                <ellipse cx="34" cy="36" rx="20" ry="12" fill="rgba(176,190,197,0.8)"/>
                <circle cx="24" cy="42" rx="14" fill="rgba(144,164,174,0.85)"/>
                <g stroke="#64B5F6" stroke-width="2.5" stroke-linecap="round" opacity="0.75">
                  <line x1="32" y1="60" x2="27" y2="74"/><line x1="50" y1="60" x2="45" y2="74"/>
                  <line x1="68" y1="60" x2="63" y2="74"/>
                </g>
              </svg>

              <svg v-else class="wi" viewBox="0 0 100 100">
                <ellipse cx="50" cy="38" rx="30" ry="16" fill="rgba(176,190,197,0.82)"/>
                <circle cx="24" cy="40" rx="14" fill="rgba(144,164,174,0.8)"/>
                <g fill="rgba(227,242,253,0.8)">
                  <circle cx="34" cy="62" r="2.8"/><circle cx="50" cy="70" r="2.8"/>
                  <circle cx="66" cy="62" r="2.8"/><circle cx="42" cy="78" r="2.3"/>
                  <circle cx="58" cy="80" r="2.3"/>
                </g>
              </svg>
            </div>
          </div>

          <!-- 详情网格 -->
          <div class="details">
            <div class="di"><span class="dv">{{ weather.humidity }}<em>%</em></span><span class="dk">湿度</span></div>
            <div class="di"><span class="dv">{{ weather.windSpeed }}<em>km/h</em></span><span class="dk">风速</span></div>
            <div class="di"><span class="dv">{{ weather.windDir }}</span><span class="dk">风向</span></div>
            <div class="di"><span class="dv">{{ weather.pressure }}<em>hPa</em></span><span class="dk">气压</span></div>
            <div class="di"><span class="dv uv" :class="'uv-' + Math.min(3, Math.ceil(Number(weather.uvIndex)/4))">{{ weather.uvIndex }}</span><span class="dk">紫外线</span></div>
            <div class="di"><span class="dv">{{ weather.cloudCover }}<em>%</em></span><span class="dk">云量</span></div>
          </div>
        </div>
      </div>
    </template>

    <!-- 加载中 -->
    <template v-else-if="loading">
      <div class="loading">
        <div class="spin"></div>
        <span>加载...</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.weather-widget { height: 100%; width: 100%; }

/* ======== 卡片容器 ======== */
.wc {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  border-radius: inherit;
  color: #fff;
}

/* 渐变背景 */
.wc {
  background: linear-gradient(145deg, #3b82f6, #60a5fa, #93c5fd, #bfdbfe);
}
.wc.t-partly-cloudy {
  background: linear-gradient(145deg, #4b6a8a, #6b8aad, #96adbf, #c5d2de);
}
.wc.t-cloudy {
  background: linear-gradient(145deg, #475569, #64748b, #94a3b8, #cbd5e1);
}
.wc.t-rainy {
  background: linear-gradient(145deg, #334155, #475569, #64748b, #94a3b8);
}
.wc.t-snowy {
  background: linear-gradient(145deg, #6366f1, #818cf8, #a5b4fc, #c7d2fe);
}

/* 装饰性背景大图标 */
.deco-icon {
  position: absolute;
  top: -15%;
  right: -10%;
  width: 70%;
  height: auto;
  z-index: 0;
  pointer-events: none;
  opacity: 1;
}

.deco-icon svg {
  width: 100%;
  height: auto;
}

/* 内容层 */
.body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px 14px;
  box-sizing: border-box;
}

/* ---- 上半区 ---- */
.upper {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: auto;
}
.left-col { display: flex; flex-direction: column; gap: 2px; }

.city-row { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
.city { font-size: 14px; font-weight: 600; letter-spacing: 0.04em; text-shadow: 0 1px 4px rgba(0,0,0,.15); }
.aqi-badge {
  font-size: 10.5px;
  padding: 1px 7px;
  border-radius: 20px;
  background: rgba(255,255,255,.22);
  text-shadow: 0 1px 2px rgba(0,0,0,.1);
}

.temp-row { display: inline-flex; align-items: baseline; line-height: 1; }
.temp-num { font-size: 52px; font-weight: 200; letter-spacing: -2.5px; text-shadow: 0 2px 12px rgba(0,0,0,.12); }
.temp-deg { font-size: 18px; font-weight: 300; margin-left: 2px; opacity: 0.85; text-shadow: 0 1px 4px rgba(0,0,0,.1); }
.sub-row { font-size: 12.5px; opacity: 0.78; text-shadow: 0 1px 3px rgba(0,0,0,.1); }

.icon-wrap { flex-shrink: 0; margin-right: -2px; margin-bottom: -4px; }
.wi { width: 64px; height: 64px; filter: drop-shadow(0 2px 8px rgba(0,0,0,.12)); }

/* ---- 详情网格 ---- */
.details {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px 4px;
  padding-top: 6px;
}
.di { display: flex; flex-direction: column; gap: 1px; }
.dv { font-size: 14px; font-weight: 600; letter-spacing: -0.3px; text-shadow: 0 1px 3px rgba(0,0,0,.12); }
.dv em { font-style: normal; font-size: 10px; font-weight: 500; opacity: 0.65; margin-left: 1px; }
.dk { font-size: 9.5px; opacity: 0.55; text-transform: uppercase; letter-spacing: 0.05em; }
.dv.uv-1 { color: #bbf7d0; }
.dv.uv-2 { color: #fef08a; }
.dv.uv-3 { color: #fdba74; }

/* ---- 配置表单 ---- */
.cfg { display: flex; flex-direction: column; gap: 8px; height: 100%; justify-content: center; padding: 8px; box-sizing: border-box; }
.cfg-lbl { font-size: 12px; color: #888; }
.cfg-inp { padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.06); color: #eee; font-size: 13px; outline: none; }
.cfg-inp:focus { border-color: rgba(96,165,250,.4); box-shadow: 0 0 0 3px rgba(96,165,250,.1); }
.cfg-btns { display: flex; gap: 8px; margin-top: 4px; }
.cfg-btn { flex: 1; padding: 8px; border-radius: 10px; border: none; font-size: 13px; font-weight: 500; cursor: pointer; }
.cfg-btn.no { background: rgba(255,255,255,.08); color: #aaa; }
.cfg-btn.ok { background: linear-gradient(135deg, #60a5fa, #3b82f6); color: #fff; }

/* ---- 配置入口 ---- */
.prompt { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; cursor: pointer; opacity: .5; }
.prompt:hover { opacity: .9; }
.prompt-icon { font-size: 20px; }
.prompt-txt { font-size: 13px; color: #888; }

/* ---- 错误 ---- */
.err { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; }
.err-msg { color: #f87171; font-size: 13px; text-align: center; padding: 0 12px; }
.err-retry { font-size: 12px; color: #60a5fa; cursor: pointer; text-decoration: underline; }

/* ---- 加载 ---- */
.loading { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 10px; color: #888; font-size: 13px; }
.spin { width: 26px; height: 26px; border: 2px solid rgba(255,255,255,.1); border-top-color: #60a5fa; border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
