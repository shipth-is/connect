import react from '@vitejs/plugin-react'
import {defineConfig} from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  build: {
    // No inline scripts or styles in the output - the CSP allows 'self' only
    modulePreload: {polyfill: false},
    assetsInlineLimit: 0,
  },
  // Test the browser build of @foxt/js-srp - the one the page uses.
  // scripts/make-vector.mjs uses the Node build.
  ssr: {resolve: {conditions: ['browser'], externalConditions: ['browser']}},
  test: {setupFiles: ['test/setup.ts']},
})
