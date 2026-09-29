import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        // Lab pages are dev-server-only; they never ship in a production build.
        ...(mode !== 'production'
          ? {
              'sound-lab': fileURLToPath(new URL('./sound-lab.html', import.meta.url)),
              'touch-lab': fileURLToPath(new URL('./touch-lab.html', import.meta.url)),
            }
          : {}),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**/*.ts'],
    },
  },
}))
