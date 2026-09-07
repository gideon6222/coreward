import { defineConfig } from 'vite';

export default defineConfig({
  /* GitHub Pages serves this from /coreward/, not from the domain root, so
     every emitted URL must be relative. The hand-written manifest, service
     worker and icon already use './' for the same reason. */
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  }
});
