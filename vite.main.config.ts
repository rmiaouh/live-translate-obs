import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    __LIVE_TRANSLATE_UPDATE_URL__: JSON.stringify(
      process.env.LIVE_TRANSLATE_UPDATE_URL ?? '',
    ),
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      external: ['electron'],
    },
  },
});
