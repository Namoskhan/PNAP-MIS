import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = parseInt(env.VITE_PORT || env.PORT || '5173', 10);
  const backendUrl = env.VITE_BACKEND_URL || env.BACKEND_URL || 'http://localhost:5000';

  return {
    plugins: [react()],
    server: {
      port,
      proxy: {
        '/api': backendUrl,
        '/uploads': backendUrl,
      },
    },
  };
});
