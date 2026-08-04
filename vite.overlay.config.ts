import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/overlay',
  base: '/overlay-assets/',
  plugins: [react()],
  build: {
    outDir: '../../resources/overlay-dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
