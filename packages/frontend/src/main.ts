// Declare the layer order before any eager or lazy component stylesheet loads.
import './styles/main.css'
import './styles/liquidGlass.css'
import './styles/widgetAppearance.css'
import { registerOfflineShell } from './services/offlineShell'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')

registerOfflineShell()
