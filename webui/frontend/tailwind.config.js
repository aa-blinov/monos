/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{svelte,js,ts}"
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#0f172a',
        }
      }
    }
  },
  plugins: [],
  darkMode: 'class'
}
