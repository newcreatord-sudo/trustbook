import defaultTheme from 'tailwindcss/defaultTheme'

/** @type {import('tailwindcss').Config} */

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    container: {
      center: true,
    },
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', ...defaultTheme.fontFamily.sans],
      },
      boxShadow: {
        tbElevated:
          '0 1px 0 0 rgba(255,255,255,0.07) inset, 0 20px 50px -12px rgba(0,0,0,0.55)',
        tbGlow:
          '0 0 0 1px rgba(79,124,255,0.22), 0 12px 40px -8px rgba(79,124,255,0.35)',
      },
    },
  },
  plugins: [],
}
