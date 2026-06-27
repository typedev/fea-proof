import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `base` is '/fea-proof/' for production builds (deployed to
// typedev.github.io/fea-proof/) and '/' for the dev server.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/fea-proof/' : '/',
  plugins: [react(), tailwindcss()],
}))
