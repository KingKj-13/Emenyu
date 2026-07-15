import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = 'http://localhost:3016';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const basePath = env.VITE_BASE_PATH || '/carmella-production';

  return {
    plugins: [react()],
    base: `${basePath}/`,
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
        [`${basePath}/api`]: { target: API_TARGET, changeOrigin: true },
        [`${basePath}/Images`]: { target: API_TARGET, changeOrigin: true },
        [`${basePath}/uploads`]: { target: API_TARGET, changeOrigin: true },
        [`${basePath}/socket.io`]: { target: API_TARGET, changeOrigin: true, ws: true },
      },
    },
  };
});
