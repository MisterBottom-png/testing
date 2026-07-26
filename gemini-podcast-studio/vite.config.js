import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../.vite-build',
    emptyOutDir: true
  }
});
