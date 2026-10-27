import react from '@vitejs/plugin-react'
// vitest/config rather than vite: the `test` block is not part of Vite's own config type.
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // ES-module workers: the real-time AudioWorklet is loaded with addModule, which has no
  // importScripts - the classic-worker wrapper Vite would otherwise put around it in dev.
  worker: { format: 'es' },
  plugins: [
    react(),
    // Everything this app does - solving, plotting, exporting - runs in the browser with no server
    // call at any point, so it already works offline once the assets are cached. The service worker
    // is what turns that from "happens to work" into installable and reliable.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'Pedal Designer',
        short_name: 'Pedal Designer',
        description:
          '기타 이펙트 페달 회로를 조합하고 시뮬레이션하고 BOM/PCB 넷리스트까지 뽑아내는 웹 기반 스키매틱 에디터',
        lang: 'ko',
        theme_color: '#191a10',
        background_color: '#f2f3e8',
        display: 'standalone',
        start_url: '/',
        icons: [
          // The SVG favicon doubles as the app icon: it is the only mark this project has, and one
          // maskable SVG scales to every launcher size without shipping a pile of PNGs.
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // The transient solver ships as its own worker chunk, so .js has to be precached for the
        // simulation to work offline - not just the main bundle.
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
    }),
  ],
  test: {
    // Playwright owns e2e/; without this vitest picks the specs up and fails on its imports.
    exclude: ['e2e/**', 'node_modules/**'],
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
        statements: 72,
        branches: 62,
        functions: 69,
        lines: 74,
      },
    },
  },
})
