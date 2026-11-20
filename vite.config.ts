import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// COOP/COEP habilitan crossOriginIsolated (necesario para el núcleo multihilo de ffmpeg.wasm).
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // ffmpeg.wasm crea su propio Worker; el pre-bundling de Vite rompe esa ruta.
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
})
