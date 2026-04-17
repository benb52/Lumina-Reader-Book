import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      // VitePWA({
      //   registerType: 'autoUpdate',
      //   includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      //   workbox: {
      //     maximumFileSizeToCacheInBytes: 5000000, // 5MB
      //     globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      //   },
      //   manifest: {
      //     name: 'LuminaBook',
      //     short_name: 'LuminaBook',
      //     description: 'AI-powered reading assistant for PDF and text files.',
      //     theme_color: '#ffffff',
      //     background_color: '#ffffff',
      //     display: 'standalone',
      //     orientation: 'portrait',
      //     icons: [
      //       {
      //         src: 'https://cdn-icons-png.flaticon.com/512/3145/3145765.png',
      //         sizes: '192x192',
      //         type: 'image/png'
      //       },
      //       {
      //         src: 'https://cdn-icons-png.flaticon.com/512/3145/3145765.png',
      //         sizes: '512x512',
      //         type: 'image/png'
      //       },
      //       {
      //         src: 'https://cdn-icons-png.flaticon.com/512/3145/3145765.png',
      //         sizes: '512x512',
      //         type: 'image/png',
      //         purpose: 'any maskable'
      //       }
      //     ]
      //   }
      // })
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
