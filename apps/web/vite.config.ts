import react from '@vitejs/plugin-react'
// vitest/config rather than vite: the `test` block is not part of Vite's own config type.
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html'],
      // Only the code that ships. Presets and wiring data are exercised by the sanity suites but
      // they are data, not logic, and counting them would drown the numbers that matter.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/**/*.d.ts',
        'src/core/library/presets/**',
        'src/editor/wiring/**',
      ],
      thresholds: {
        // Set just under where the suite currently sits, so a real regression fails the build but
        // ordinary churn does not. Raise them when the number climbs, never lower them to pass.
        statements: 70,
        branches: 60,
        functions: 64,
        lines: 72,
      },
    },
  },
})
