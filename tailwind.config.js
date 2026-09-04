/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  // ThemeContext sets data-theme="dark" on <html>, not a .dark class.
  // With darkMode:"class" every dark: utility in the app was inert.
  // Tailwind appends the descendant relationship itself, so the custom
  // selector must NOT contain '&'.
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1200px" }
    },
    extend: {
      // One source of truth: these REFERENCE the CSS variables in
      // index.css rather than defining rival values. The old palette
      // defined brand.teal #00bcd4 here while index.css said #14b8a6,
      // and neither was the charity's actual colour.
      colors: {
        brand: {
          DEFAULT: "var(--color-brand)",
          ink: "var(--color-brand-ink)",
          subtle: "var(--color-brand-subtle)",
          on: "var(--color-on-brand)"
        },
        surface: {
          DEFAULT: "var(--color-background)",
          alt: "var(--color-background-secondary)",
          raised: "var(--color-background-elevated)"
        },
        ink: {
          DEFAULT: "var(--color-text-primary)",
          soft: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)"
        },
        line: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)"
        }
      },
      fontFamily: {
        sans: ["Poppins", "ui-sans-serif", "system-ui", "-apple-system",
               "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"]
      },
      boxShadow: {
        card: "0 4px 12px rgba(0,0,0,0.1)"
      },
      borderRadius: {
        "2xl": "1rem"
      }
    }
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/typography")
  ]
};

