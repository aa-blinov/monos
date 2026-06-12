/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{svelte,js,ts}"
  ],
  theme: {
    extend: {
      colors: {
        gruvbox: {
          light: {
            bg: '#fbf1c7',
            'bg-alt': '#ebdbb2',
            'bg-hard': '#f9f5d7',
            fg: '#282828',
            'fg-alt': '#3c3836',
            red: '#cc241d',
            green: '#98971a',
            yellow: '#d79921',
            blue: '#458588',
            purple: '#b16286',
            aqua: '#689d6a',
            orange: '#d65d0e',
          },
          dark: {
            bg: '#282828',
            'bg-alt': '#3c3836',
            'bg-hard': '#1d2021',
            fg: '#ebdbb2',
            'fg-alt': '#bdae93',
            red: '#fb4934',
            green: '#b8bb26',
            yellow: '#fabd2f',
            blue: '#83a598',
            purple: '#d3869b',
            aqua: '#8ec07c',
            orange: '#fe8019',
          }
        }
      }
    }
  },
  plugins: [],
  darkMode: 'class'
}
