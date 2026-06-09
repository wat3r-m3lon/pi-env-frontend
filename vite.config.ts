import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Single-page app. index.html is the entry; React mounts into #root and
// owns the <canvas> the twin renders into.
export default defineConfig({
  plugins: [react()],
  // Pin an empty inline PostCSS config so Vite does NOT search up the tree and
  // pick up a stray ~/postcss.config.js (which references tailwind we don't use).
  css: {
    postcss: { plugins: [] },
  },
  server: {
    host: true, // expose on LAN so a phone/other machine can open the dashboard
    // Honor a PORT env var when one is provided (e.g. by the preview harness);
    // otherwise let Vite pick its default / next free port.
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
  },
});
