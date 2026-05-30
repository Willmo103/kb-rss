import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist-frontend',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
  server: {
    port: 3000
  }
})
