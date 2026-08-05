import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#05060a',
          900: '#0a0c14',
          800: '#11141f',
          700: '#1a1f2e',
        },
        aurora: {
          violet: '#8b5cf6',
          indigo: '#6366f1',
          cyan: '#22d3ee',
          iris: '#a78bfa',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-space)', 'var(--font-inter)', 'sans-serif'],
      },
      backgroundImage: {
        'aurora-glow':
          'radial-gradient(1200px 600px at 20% -10%, rgba(139,92,246,0.22), transparent 60%), radial-gradient(1000px 500px at 90% 10%, rgba(34,211,238,0.12), transparent 55%)',
        'grid-fade':
          'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
      },
      boxShadow: {
        glass: '0 8px 40px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
        glow: '0 0 60px -15px rgba(139,92,246,0.5)',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
      animation: {
        'pulse-soft': 'pulse-soft 3s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
