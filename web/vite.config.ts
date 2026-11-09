// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Static build (dist/) with a relative base so it can be served from any path.
// The spec renderer is shared with the CLI (../src/specmodel.ts), so the dev
// server may read one level up.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: { fs: { allow: ['..'] } },
  build: { chunkSizeWarningLimit: 900 },
});
