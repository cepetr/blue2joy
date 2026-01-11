import { defineConfig } from 'vite';

export default defineConfig({
  // Use BASE_PATH env var for versioned deployments (e.g., BASE_PATH=/v1.2.3/ npm run build)
  // Defaults to root path for development and standard deployments
  base: process.env.BASE_PATH || '/',
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
