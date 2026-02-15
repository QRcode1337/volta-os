/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0f1419',
          surface: '#1a1f2e',
          card: '#252b3b',
          border: '#2d3548',
        },
        status: {
          todo: '#5865f2',
          progress: '#f26522',
          done: '#57f287',
          archived: '#4e5569',
        },
        neon: {
          pink: '#FF00FF',
          'hot-pink': '#FF006E',
          cyan: '#00FFFF',
          green: '#00FF00',
          red: '#FF0000',
        },
        bg: {
          void: '#0D0D0D',
          'layer-1': '#1A1A2E',
          'layer-2': '#252b3b',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'neon-pulse': 'neon-pulse 2s ease-in-out infinite',
        'glitch': 'glitch 0.3s ease-in-out',
        'rgb-split': 'rgb-split 4s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 8s ease infinite',
        'scanline': 'scanline 6s linear infinite',
      },
      keyframes: {
        'neon-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'glitch': {
          '0%': { transform: 'translate3d(0, 0, 0)' },
          '20%': { transform: 'translate3d(-2px, 2px, 0)' },
          '40%': { transform: 'translate3d(-2px, -2px, 0)' },
          '60%': { transform: 'translate3d(2px, 2px, 0)' },
          '80%': { transform: 'translate3d(2px, -2px, 0)' },
          '100%': { transform: 'translate3d(0, 0, 0)' },
        },
        'rgb-split': {
          '0%, 100%': { textShadow: '-2px 0 #FF00FF, 2px 0 #00FFFF' },
          '25%': { textShadow: '2px 0 #FF00FF, -2px 0 #00FFFF' },
          '50%': { textShadow: '-1px 2px #FF00FF, 1px -2px #00FFFF' },
          '75%': { textShadow: '1px -1px #FF00FF, -1px 1px #00FFFF' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'scanline': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
    },
  },
  plugins: [],
}
