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
      colors: {
        tb: {
          bg: 'var(--tb-bg)',
          'bg-deep': 'var(--tb-bg-deep)',
          text: 'var(--tb-text)',
          muted: 'var(--tb-muted)',
          'muted-2': 'var(--tb-muted-2)',
          primary: 'var(--tb-primary)',
          'primary-hover': 'var(--tb-primary-hover)',
          ring: 'var(--tb-ring)',
          border: 'var(--tb-border)',
          surface: 'var(--tb-surface)',
          'surface-2': 'var(--tb-surface-2)',
          danger: 'var(--tb-danger)',
          'danger-bg': 'var(--tb-danger-bg)',
        },
      },
      borderRadius: {
        'tb-xl': 'var(--tb-radius-xl)',
        'tb-2xl': 'var(--tb-radius-2xl)',
        'tb-3xl': 'var(--tb-radius-3xl)',
      },
      transitionDuration: {
        'tb-fast': 'var(--tb-motion-fast)',
        'tb-med': 'var(--tb-motion-med)',
        'tb-overlay': 'var(--tb-motion-overlay)',
      },
      transitionTimingFunction: {
        'tb-out': 'var(--tb-ease-out)',
        'tb-standard': 'var(--tb-ease-standard)',
      },
      boxShadow: {
        tbElevated:
          '0 1px 0 0 rgba(255,255,255,0.07) inset, 0 20px 50px -12px rgba(0,0,0,0.55)',
        tbGlow:
          '0 0 0 1px rgba(79,124,255,0.22), 0 12px 40px -8px rgba(79,124,255,0.35)',
      },
      keyframes: {
        tbFadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        tbSoftPulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.65' },
        },
      },
      animation: {
        'tb-fade-in': 'tbFadeIn var(--tb-motion-med) var(--tb-ease-out) forwards',
        'tb-soft-pulse': 'tbSoftPulse 2.2s var(--tb-ease-standard) infinite',
      },
    },
  },
  plugins: [],
}
