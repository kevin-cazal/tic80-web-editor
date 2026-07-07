import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  define: {
    __TIC80_CACHE_BUST__: JSON.stringify(process.env.BUILD_ID ?? 'dev'),
  },
  server: {
    headers: {
      'Cache-Control': 'no-store',
    },
  },
})
