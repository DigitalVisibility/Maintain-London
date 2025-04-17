/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        'brand': {
          'green': '#AEDE4A',
          'pink': '#FF69B4',
          'purple': '#8A2BE2',
        }
      },
      fontFamily: {
        'sans': ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        'display': ['Inter Variable', 'system-ui', 'sans-serif']
      }
    },
  },
  plugins: [],
}