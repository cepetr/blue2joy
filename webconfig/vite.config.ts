import { defineConfig } from 'vite';

export default defineConfig({
  // Ensure relative asset paths when serving from non-root (e.g., file:// or subfolders)
  base: './',
  publicDir: 'public',
  server: {
    port: 8080,
    open: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: true,
    cssCodeSplit: true,
  },
});
