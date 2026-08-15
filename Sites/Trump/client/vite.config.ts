import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Bug M-4 (Carmella demo validation report): client/public/manifest.json is a
// static file Vite copies byte-for-byte -- unlike index.html, it never went
// through the %VITE_BASE_PATH%-style templating, so every tenant build
// (Carmella included) shipped Trump's own PWA identity (name "Emenyu Trump",
// start_url/scope/icon all under /Trump/). This plugin overwrites the copied
// file post-build with tenant-correct values computed from the same env vars
// index.html already uses. For Trump's own default build (no .env.carmella/
// .env.demo loaded, so every VITE_* below is unset) every fallback below
// reproduces the previous static file byte-for-byte -- zero behavior change.
function tenantManifestPlugin(env: Record<string, string>, basePath: string): Plugin {
  let outDirAbs = '';
  return {
    name: 'tenant-manifest',
    apply: 'build',
    // Read the FINAL resolved outDir (after Vite merges the `--outDir` CLI
    // flag Carmella's build uses) rather than assuming the config's own
    // 'dist' -- process.cwd() is always Trump/client regardless of where
    // --outDir points, so writing to `${cwd}/dist` silently missed
    // Carmella's actual `../../Carmella/client/dist` output entirely.
    configResolved(resolvedConfig) {
      outDirAbs = path.resolve(resolvedConfig.root, resolvedConfig.build.outDir);
    },
    closeBundle() {
      const brandName = env.VITE_BRAND_NAME || 'Trumps';
      const manifest = {
        name: env.VITE_BRAND_NAME ? `Emenyu ${brandName}` : 'Emenyu Trump',
        short_name: env.VITE_SHORT_NAME || brandName,
        description: env.VITE_HTML_DESCRIPTION || 'Trumps Restaurant & Bar — staff portal and menu',
        theme_color: '#001724',
        background_color: '#001724',
        display: 'standalone',
        orientation: 'portrait',
        start_url: `${basePath}/table1`,
        scope: `${basePath}/`,
        icons: [
          { src: `${basePath}/favicon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      };
      fs.writeFileSync(path.join(outDirAbs, 'manifest.json'), JSON.stringify(manifest, null, 2));
    }
  };
}

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
    plugins: [react(), tenantManifestPlugin(env, basePath)],
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
        // Dev-only convenience so `vite --mode carmella` can be run standalone
        // against the already-running Carmella API server for fast HMR
        // iteration (demo-polish sprint 2) -- has no effect on any built
        // bundle; production requests never go through this dev proxy.
        '/Carmella/api': { target: 'http://localhost:3015', changeOrigin: true },
        '/Carmella/submit_order': { target: 'http://localhost:3015', changeOrigin: true },
        '/Carmella/orders': { target: 'http://localhost:3015', changeOrigin: true },
        '/Carmella/history': { target: 'http://localhost:3015', changeOrigin: true },
        '/Carmella/complete': { target: 'http://localhost:3015', changeOrigin: true },
        '/Carmella/incomplete': { target: 'http://localhost:3015', changeOrigin: true },
        '/Carmella/Images': { target: 'http://localhost:3015', changeOrigin: true },
        '/Carmella/Video': { target: 'http://localhost:3015', changeOrigin: true },
        '/Carmella/uploads': { target: 'http://localhost:3015', changeOrigin: true },
        '/Carmella/socket.io': { target: 'http://localhost:3015', changeOrigin: true, ws: true },
      },
    },
  };
});
