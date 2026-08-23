import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  plugins: [
    react(),
    wasm() // Handles the binary streaming safely
  ],
  base: './', 
  build: {
    target: 'esnext', // Natively handles top-level await! No extra plugins needed.
    rollupOptions: {
      external: ['hyperswarm', 'b4a', 'hypercore-crypto']
    }
  },
  optimizeDeps: {
    exclude: ['hyperswarm', 'b4a', 'hypercore-crypto']
  }
})