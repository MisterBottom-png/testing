import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../.single-file-build',
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: false,
    assetsInlineLimit: 1_048_576,
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/chunk-[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
});
