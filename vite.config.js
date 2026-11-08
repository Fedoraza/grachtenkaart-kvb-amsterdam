import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  build: {
    manifest: true,
    rollupOptions: { input: { app: path.resolve(__dirname, 'index.html'), publicPages: path.resolve(__dirname, 'src/publicPages.js') } },
  },
  plugins: [vue(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5173',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5173',
        ws: true,
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ['**/data/**', '**/*.sqlite', '**/*.sqlite-*'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
