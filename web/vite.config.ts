import { defineConfig } from 'vite';

export default defineConfig({
  // libsodium's ESM build uses top-level await; the default es2020 target
  // rejects it. Every browser we care about (installable-PWA era) is es2022+.
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  build: { target: 'es2022' },
});
