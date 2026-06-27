import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Relative base by default, so the built `dist/` is portable — host it at a
// domain root, in any subfolder (e.g. GitHub Pages project sites), or open the
// files directly. Override with VITE_BASE=/path/ if you need an absolute base.
export default defineConfig({
  base: process.env.VITE_BASE || './',
  plugins: [react(), tailwindcss()],
})
