import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: parseInt(process.env.SUPERBOT2_UI_PORT || '47474', 10),
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.SUPERBOT2_API_PORT || '3274'}`,
        changeOrigin: true,
      },
    },
  },
})
