/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      fontFamily: {
        head: ['Outfit', 'sans-serif'],
        sans: ['IBM Plex Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        hub: {
          yellow: '#F5C842',
          green: '#4CAF7D',
          blue: '#5B9BD5',
          purple: '#9B7EDE',
          red: '#FF6B5E',
          cream: '#FFF9E8',
          dark: '#1E293B',
          white: '#FFFFFF',
        },
        cosmic: {
          bg: '#FFF9E8',
          card: '#FFFFFF',
          reader: '#FFFDF5',
          border: '#1E293B',
          blue: '#5B9BD5',
          cyan: '#4CAF7D',
          amber: '#F5C842',
          text: '#1E293B',
          sub: '#64748B',
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': '#F5C842',
          '2': '#4CAF7D',
          '3': '#5B9BD5',
          '4': '#9B7EDE',
          '5': '#FF6B5E'
        }
      },
      boxShadow: {
        'sticker': '4px 4px 0px #1E293B',
        'sticker-sm': '2px 2px 0px #1E293B',
        'sticker-lg': '6px 6px 0px #1E293B',
        'sticker-xl': '8px 8px 0px #1E293B',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0'
          },
          to: {
            height: 'var(--radix-accordion-content-height)'
          }
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)'
          },
          to: {
            height: '0'
          }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
};