import {defineConfig} from 'vite'

export default defineConfig({
  build: {
    // No inline scripts or styles in the output - the CSP allows 'self' only
    modulePreload: {polyfill: false},
    assetsInlineLimit: 0,
  },
})
