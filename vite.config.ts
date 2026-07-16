import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works locally (file/dist preview) and
  // on GitHub Pages regardless of mount path — the root custom domain
  // (fog-atlas.com, via public/CNAME) or the old /fog-atlas/ subpath both work.
  base: './',
})
