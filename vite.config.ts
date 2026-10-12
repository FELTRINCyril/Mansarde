/// <reference types="vitest/config" />
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { polygonClippingEnv, polygonClippingLimits, polygonClippingLimitsDeps } from './vite.polygonClipping.ts'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app under /<repo>/: the deploy workflow sets BASE_PATH=/plan-maison/
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), polygonClippingLimits()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  // three: pre-bundled at startup, else the first opening of the 3D view (dynamic import) makes the
  // dev server optimize it and reload the page
  optimizeDeps: { include: ['jspdf', 'svg2pdf.js', 'three', 'three/addons/controls/OrbitControls.js', 'three/addons/geometries/RoundedBoxGeometry.js', 'three/addons/renderers/CSS2DRenderer.js'], rolldownOptions: { plugins: [polygonClippingLimitsDeps()] } },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    env: polygonClippingEnv(),
    // CPU-heavy tests (fuzz, random cross-checks) exceed the 5 s default when the machine is loaded (V2-R28)
    testTimeout: 30000,
  },
})
