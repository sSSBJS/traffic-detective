import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        slateBlue: "#29577f",
        sea: "#0f766e",
        sand: "#f4efe6",
        mist: "#d7e6f2",
      },
      boxShadow: {
        soft: "0 20px 45px rgba(15, 23, 42, 0.14)",
      },
      backgroundImage: {
        hero: "linear-gradient(135deg, rgba(16, 24, 40, 0.72), rgba(12, 74, 110, 0.52))",
        section: "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(239,246,255,0.88))",
      },
      fontFamily: {
        sans: ["Roboto", "Noto Sans KR", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
