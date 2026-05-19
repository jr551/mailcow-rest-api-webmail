import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

const devApiTarget = process.env.VITE_DEV_API_TARGET || 'http://localhost:3001';

// Built assets are served by the Fastify server under /webmail/.
// `base` makes Vite emit asset URLs prefixed with /webmail/.
export default defineConfig({
    plugins: [svelte()],
    base: '/webmail/',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        target: 'es2022',
        sourcemap: false,
        cssCodeSplit: false,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                mobile: resolve(__dirname, 'mobile/index.html'),
            },
        },
    },
    server: {
        port: 5173,
        // Dev mode proxies API calls to a local API server by default.
        proxy: {
            '/v1': { target: devApiTarget, changeOrigin: true, secure: false },
            '/openapi.json': { target: devApiTarget, changeOrigin: true, secure: false },
            '/health': { target: devApiTarget, changeOrigin: true, secure: false },
            '/imap-rest': { target: devApiTarget, changeOrigin: true, secure: false }
        }
    }
});
