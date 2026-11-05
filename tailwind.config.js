/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FDFBF7',
          100: '#FAF7EE', // Canvas background from screenshots
          200: '#F4EFE0', // Secondary warm cream
          300: '#EAE3D2', // Muted cream border
          400: '#DED5C0',
        },
        brand: {
          blue: '#204E96',       // Reference royal/navy primary blue
          hover: '#183E78',      // Reference button hover
          dark: '#152E5A',       // Heading deep navy
          body: '#354F77',       // Body copy slate blue
          muted: '#6385B2',      // Muted tag & category text
          light: '#E8EEF6',      // Pale blue circle/badge background
          card: '#FFFFFF',       // Clean card surface
          border: '#EBE5D5',     // Soft card border
        },
        navy: {
          950: '#0B1A33',
          900: '#152E5A',
          800: '#1B3B70',
          700: '#204E96',
          600: '#2E69C5',
        },
        slate: {
          850: '#1B2C46',
        },
        chalk: {
          50: '#FAF7EE',
          100: '#F4EFE0',
          200: '#EAE3D2',
          300: '#CBD5E1',
        },
        institutional: {
          gold: '#C5A059',
          navy: '#152E5A',
          border: '#EBE5D5',
          canvas: '#FAF7EE',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', 'monospace'],
      },
      borderRadius: {
        '2xl': '1.125rem', // 18px
        '3xl': '1.5rem',   // 24px
        '4xl': '2rem',     // 32px
      }
    },
  },
  plugins: [],
}
