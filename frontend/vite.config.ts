import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Important for Electron and NestJS static serving
  server: {
    proxy: {
      '/attendance': 'http://localhost:3456'
    }
  }
})
