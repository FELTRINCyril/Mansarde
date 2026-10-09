/// <reference types="vitest/config" />
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { polygonClippingEnv, polygonClippingLimits, polygonClippingLimitsDeps } from './vite.polygonClipping.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), polygonClippingLimits()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  optimizeDeps: { include: ['jspdf', 'svg2pdf.js'], rolldownOptions: { plugins: [polygonClippingLimitsDeps()] } },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    env: polygonClippingEnv(),
    // CPU-heavy tests (fuzz, random cross-checks) exceed the 5 s default when the machine is loaded (V2-R28)
    testTimeout: 30000,
  },
})
