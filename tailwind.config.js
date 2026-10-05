/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
      'arabic': ['Cairo', 'Segoe UI', 'Tahoma', 'Arial', 'sans-serif'],
    },
    extend: {
      animation: {
        'spin-slow': 'spin 3s linear infinite',
      },
      colors: {
        primary: {
          DEFAULT: '#162856',
          50: '#e8ebf0',
          100: '#d1d7e1',
          200: '#a3afc3',
          300: '#7587a5',
          400: '#475f87',
          500: '#162856',
          600: '#122045',
          700: '#0d1834',
          800: '#091023',
          900: '#040812',
        },
        sidebar: '#9F9F9F',
        'sidebar-bg': '#EBEBEB',
        'student-portal': '#1a3a6b',
        accent: {
          DEFAULT: '#76bde5',
          50: '#f0f9fc',
          100: '#e1f3f9',
          200: '#c3e7f3',
          300: '#a5dbed',
          400: '#87cfe7',
          500: '#76bde5',
          600: '#5e97b7',
          700: '#467189',
          800: '#2e4b5b',
          900: '#16252d',
        },
        'text-primary': '#ffffff',
        'text-secondary': '#a0a0a0',
        gradient: {
          start: '#162856',
          end: '#76bde5'
        },
        teal: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        gray: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        },
        emerald: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        pink: {
          DEFAULT: '#E82B5E',
          50: '#fdf2f6',
          100: '#fce7ef',
          200: '#fbd0e0',
          300: '#f9a8c6',
          400: '#f473a6',
          500: '#E82B5E',
          600: '#d41e4f',
          700: '#b11441',
          800: '#8e1134',
          900: '#731028',
        },
        purple: {
          dark: '#1B0E1B',
        },
        'purple-dark': '#4A235A',
        'pink-dark': '#d43d77',
      },
      spacing: {
        'sidebar': '280px',
      },
      backgroundImage: {
        'primary-gradient': 'linear-gradient(to right, #162856, #76bde5)',
        'primary-gradient-hover': 'linear-gradient(to right, #76bde5, #162856)',
        'bg-gradient': 'linear-gradient(to bottom right, #162856, #76bde5)',
        'hero-pattern': "url('/src/assets/doctor-bg.jpg')",
      },
      borderRadius: {
        '3xl': '1.5rem',
      }
    },
  },
  plugins: [],
}
  
  