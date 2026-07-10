import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Build a second time with `--mode demo` (reads .env + .env.demo — see that
// file) to produce the public "Demo Steakhouse" tenant's client bundle
// without touching Trump's own default build (mode "production", still
// /Trump/). Using Vite's file-based env instead of inline shell env vars is
// deliberate: on Windows/Git-Bash, a bare `VITE_BASE_PATH=/demo` on the shell
// command line gets silently path-mangled (MSYS auto-converts leading-slash
// strings to Windows paths), which broke the base path outright.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const basePath = env.VITE_BASE_PATH || '/Trump';

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
      '/Trump/api': {
        target: 'http://localhost:3012',
        changeOrigin: true,
      },
      '/Trump/submit_order': {
        target: 'http://localhost:3012',
        changeOrigin: true,
      },
      '/Trump/orders': {
        target: 'http://localhost:3012',
        changeOrigin: true,
      },
      '/Trump/history': {
        target: 'http://localhost:3012',
        changeOrigin: true,
      },
      '/Trump/complete': {
        target: 'http://localhost:3012',
        changeOrigin: true,
      },
      '/Trump/incomplete': {
        target: 'http://localhost:3012',
        changeOrigin: true,
      },
      '/Trump/Images': {
        target: 'http://localhost:3012',
        changeOrigin: true,
      },
      '/Trump/Video': {
        target: 'http://localhost:3012',
        changeOrigin: true,
      },
      '/Trump/uploads': {
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
  };
});
