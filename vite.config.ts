import { defineConfig } from 'vite'
import { resolve } from 'path'
import obfuscator from 'rollup-plugin-obfuscator'
import { readdirSync, existsSync } from 'fs'

// Auto-discover games from the games directory
function getGameEntries() {
  const gamesDir = resolve(__dirname, 'games')
  const entries: Record<string, string> = {
    main: resolve(__dirname, 'index.html')
  }

  if (existsSync(gamesDir)) {
    const gameFolders = readdirSync(gamesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)

    gameFolders.forEach(gameName => {
      const gameHtmlPath = resolve(gamesDir, gameName, 'index.html')
      if (existsSync(gameHtmlPath)) {
        entries[gameName] = gameHtmlPath
      }
    })
  }

  return entries
}

export default defineConfig({
  base: '/arcade/',
  plugins: [
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
      input: getGameEntries(),
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