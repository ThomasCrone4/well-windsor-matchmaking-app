/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: "class",
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1200px" }
    },
    extend: {
      colors: {
        brand: {
          teal: "#00bcd4",
          tealDark: "#0097a7",
          blue: "#1976d2",
          sky: "#4dd0e1",
          heroFrom: "#e3f2fd",
          heroTo: "#f1f8e9"
        }
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

