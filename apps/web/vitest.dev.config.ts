import { defineConfig } from 'vitest/config'

// Server transport tests must use real Node sockets, not browser polyfills.
export default defineConfig({ test: { environment: 'node', include: ['dev/**/*.test.ts'] } })
