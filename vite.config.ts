import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works both locally (file/dist preview)
  // and on GitHub Pages under /fog-atlas/
  base: './',
})
