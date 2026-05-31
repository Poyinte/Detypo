import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'

// Read backend port from env or .detypo-port file (written by server.py on startup)
function getBackendPort(): number {
  if (process.env.DETYPO_BACKEND_PORT) return parseInt(process.env.DETYPO_BACKEND_PORT, 10)
  try {
    const portFile = path.resolve(__dirname, '..', '.detypo-port')
    if (fs.existsSync(portFile)) return parseInt(fs.readFileSync(portFile, 'utf-8').trim(), 10)
  } catch { /* ignore */ }
  return 8520
}

const BACKEND_PORT = getBackendPort()

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': `http://127.0.0.1:${BACKEND_PORT}` },
  },
})
