import type { Config } from 'tailwindcss';

/**
 * Orbit design tokens — spec §14.2 / §14.3.
 * Colors exposed both as Tailwind palette entries and via CSS variables
 * (see globals.css) for use in arbitrary values.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deel-inspired neutral palette: near-black primary, clean whites/greys.
        primary: {
          DEFAULT: '#18181B', // zinc-900
          light: '#F4F4F5', // zinc-100 — selected row / hover / active nav bg
        },
        surface: '#FFFFFF',
        bg: '#FAFAFA',
        border: '#E4E4E7', // zinc-200
        text: {
          primary: '#18181B',
          secondary: '#71717A', // zinc-500
        },
        status: {
          submitted: '#3B82F6',
          review: '#F59E0B',
          approved: '#10B981',
          rejected: '#EF4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'page-title': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'section': ['18px', { lineHeight: '28px', fontWeight: '600' }],
        'card-label': ['14px', { lineHeight: '20px', fontWeight: '500' }],
        'body': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'meta': ['12px', { lineHeight: '16px', fontWeight: '400' }],
      },
      borderRadius: {
        lg: '12px',
        md: '8px',
        sm: '6px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
