import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy API calls to gateway during local dev (npm run dev)
    // So you don't need to change API_BASE_URL — just run vite dev server
    proxy: {
      '/orders': 'http://localhost:3000',
      '/inventory': 'http://localhost:3000',
    },
  },
});
