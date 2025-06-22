import { defineConfig } from 'vite'
import { resolve } from 'path'
import { ghPages } from 'vite-plugin-gh-pages'

export default defineConfig({
  base: '/arcade/',
  plugins: [ghPages()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        snake: resolve(__dirname, 'games/snake/index.html'),
        breakout: resolve(__dirname, 'games/breakout/index.html'),
        memory: resolve(__dirname, 'games/memory/index.html')
      }
    }
  }
}) 