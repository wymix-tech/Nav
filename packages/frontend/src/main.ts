// Declare the layer order before any eager or lazy component stylesheet loads.
import './styles/main.css'
import './styles/liquidGlass.css'
import './styles/widgetAppearance.css'
import { registerOfflineShell } from './services/offlineShell'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

// SVG backdrop filters are enabled only on Chromium, where this path is
// rendered reliably. Safari and Firefox retain the clear CSS material.
if (
  /Chrom(?:e|ium)\//.test(navigator.userAgent) &&
  CSS.supports('backdrop-filter', 'url("#nav-glass-lens")')
) {
  document.documentElement.dataset.glassRefraction = ''
}

const app = createApp(App)
app.use(createPinia())
app.mount('#app')

registerOfflineShell()
