import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so `npm test` never picks the (slow, machine-dependent) benchmarks up.
export default defineConfig({
  test: {
    include: ['bench/**/*.perf.ts'],
    // One file at a time, so benchmarks don't compete with each other for the CPU they are timing.
    fileParallelism: false,
  },
})
