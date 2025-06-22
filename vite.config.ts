import { defineConfig } from 'vite'
import { resolve } from 'path'
import { ghPages } from 'vite-plugin-gh-pages'
import obfuscator from 'rollup-plugin-obfuscator'

export default defineConfig({
  base: '/arcade/',
  plugins: [
    ghPages()
  ],
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // Disable sourcemaps for production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log statements
        drop_debugger: true, // Remove debugger statements
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
        passes: 2
      },
      mangle: {
        toplevel: true, // Mangle top-level names
        safari10: true
      },
      format: {
        comments: false // Remove comments
      }
    },
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        snake: resolve(__dirname, 'games/snake/index.html'),
        breakout: resolve(__dirname, 'games/breakout/index.html'),
        memory: resolve(__dirname, 'games/memory/index.html')
      },
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      },
      plugins: [
        obfuscator({
          options: {
            compact: true,
            controlFlowFlattening: false,
            deadCodeInjection: false,
            disableConsoleOutput: true,
            stringArray: true,
            stringArrayThreshold: 0.75
          },
          include: ['assets/*.js'] // Only obfuscate built JS chunks
        })
      ]
    }
  }
}) 