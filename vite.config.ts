import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: '/pool/',
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'handle-php-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.includes('api.php')) {
              const bookingsFile = path.resolve(__dirname, 'bookings.json');
              
              if (req.method === 'GET') {
                let data = '[]';
                if (fs.existsSync(bookingsFile)) {
                  data = fs.readFileSync(bookingsFile, 'utf-8');
                }
                res.setHeader('Content-Type', 'application/json');
                res.end(data);
                return;
              }
              
              if (req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', () => {
                  fs.writeFileSync(bookingsFile, body);
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true }));
                });
                return;
              }
            }
            next();
          });
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
