import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/Trump/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/framer-motion')) return 'motion';
          if (id.includes('node_modules/socket.io-client') || id.includes('node_modules/engine.io-client')) return 'socket';
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom') || id.includes('node_modules/scheduler')) return 'vendor';
        },
      },
    },
  },
  server: {
    proxy: {
      '/Trump/api': {
        target: 'http://localhost:3012',
        changeOrigin: true,
      },
      '/Trump/submit_order': {
        target: 'http://localhost:3012',
        changeOrigin: true,
      },
      '/Trump/socket.io': {
        target: 'http://localhost:3012',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
