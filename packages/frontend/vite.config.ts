import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { offlinePlugin } from './offlinePlugin'

export default defineConfig({
  plugins: [vue(), offlinePlugin()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
