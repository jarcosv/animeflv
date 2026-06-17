import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  vite: {
    ssr: {
      external: ['node:fs', 'node:path']
    }
  }
});
