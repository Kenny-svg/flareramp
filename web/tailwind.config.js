/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-outfit)", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#fff5f2",
          100: "#ffebe5",
          200: "#ffd2c7",
          300: "#ffa893",
          400: "#ff7454",
          500: "#e85d35",
          600: "#d3411b",
          700: "#b13010",
          800: "#922910",
          900: "#792612",
          950: "#420f04",
        },
      },
    },
  },
  plugins: [],
};
