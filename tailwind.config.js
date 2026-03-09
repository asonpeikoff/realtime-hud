/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        hud: {
          bg: '#0a0e1a',
          panel: '#111827',
          border: '#1f2937',
          accent: '#3b82f6',
          text: '#e2e8f0',
          muted: '#6b7280',
          danger: '#ef4444',
          success: '#22c55e',
          warning: '#f59e0b',
        },
      },
      animation: {
        pulse: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
