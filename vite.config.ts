import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // beta canary builds set TENNIL_BASE=/tennil-beta/
  base: process.env.TENNIL_BASE ?? '/',
})
