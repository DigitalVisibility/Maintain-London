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
      },
      backgroundImage: {
        'gradient-green-pink': 'linear-gradient(135deg, #AEDE4A 0%, #FF69B4 100%)',
        'gradient-pink-purple': 'linear-gradient(135deg, #FF69B4 0%, #8A2BE2 100%)',
        'gradient-tri-color': 'linear-gradient(135deg, #AEDE4A 0%, #FF69B4 50%, #8A2BE2 100%)',
        'gradient-hero-outline': 'linear-gradient(135deg, #AEDE4A 0%, #FF69B4 50%, #8A2BE2 100%)',
        'gradient-green-dark': 'linear-gradient(135deg, #AEDE4A 0%, #4CAF50 100%)',
        'gradient-green-horizontal': 'linear-gradient(90deg, #AEDE4A 0%, #83B81A 50%, #4CAF50 100%)',
        'button-green-1': 'linear-gradient(90deg, #AEDE4A 0%, #AEDE4A 70%, #83B81A 100%)',
        'button-green-2': 'linear-gradient(90deg, #AEDE4A 0%, #AEDE4A 60%, #4CAF50 100%)',
        'button-green-3': 'linear-gradient(135deg, #AEDE4A 0%, #AEDE4A 75%, #4CAF50 100%)',
        'text-gradient-green': 'linear-gradient(90deg, #AEDE4A 0%, #4CAF50 100%)',
      }
    },
  },
  plugins: [],
}