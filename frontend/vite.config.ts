/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, /v1 goes to the backend (default :3000), so the browser sees one origin and no CORS.
// `npm run dev:mock` (mode "mock") uses the in-memory API in src/api/mock.ts instead.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/v1': { target: env.VITE_BACKEND_URL || 'http://localhost:3000', changeOrigin: true }
      }
    },
    test: {
      environment: 'node'
    }
  };
});
