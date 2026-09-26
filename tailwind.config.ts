import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#1D6FB8',
        navyDeep: '#124A7D',
        // Deep marine blue of the brand (logo background) — used for borders and headings.
        marine: '#0B2545',
        offwhite: '#FAF9F6',
        lightblue: '#EAF3FB',
        gold: '#C9A24B',
        anthracite: '#1C1F26',
        // Light green reserved for the key mission actions (publish / apply).
        mission: {
          DEFAULT: '#86E3A5',
          hover: '#6FD690',
          ink: '#0B3B2A',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'var(--font-arabic)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-inter)', 'var(--font-arabic)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
