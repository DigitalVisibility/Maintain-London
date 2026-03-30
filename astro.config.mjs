import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://maintainlondon.co.uk',
  integrations: [
    tailwind(),
    react(),
    sitemap({
      filter: (page) => !page.includes('index-Copy') && !page.includes('portfolio-simple'),
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
    }),
  ],
});
