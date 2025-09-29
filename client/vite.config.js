import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import wasmPlugin from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [
    solidPlugin(),
    wasmPlugin()
  ],
  server: {
    port: 3000,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true
      }
    }
  },
  build: {
    target: 'esnext'
  }
});
