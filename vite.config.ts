import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Relative asset paths so the build works under a GitHub Pages subpath and from disk.
// The standalone step (scripts/standalone.mjs) inlines exactly one JS and one CSS file,
// so everything must land in a single chunk with every asset inlined.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    // Single chunk with nothing to preload, so skip Vite's modulepreload polyfill.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4096,
    rolldownOptions: {
      output: { codeSplitting: false },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
