import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://animeflv.lat',
  output: 'static',
  vite: {
    ssr: {
      external: ['node:fs', 'node:path']
    }
  }
});
