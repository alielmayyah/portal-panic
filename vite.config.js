import { defineConfig } from 'vite';

// Relative asset paths so the build works under a GitHub Pages subpath and from disk.
export default defineConfig({
  base: './',
});
