import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4310,
    host: true,
  },
  optimizeDeps: {
    include: ['@xyflow/react', 'zustand', '@dagrejs/dagre'],
  },
});
