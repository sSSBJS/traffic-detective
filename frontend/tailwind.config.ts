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
        surface: {
          DEFAULT: "#f8fafc",
          raised: "#ffffff",
        },
        accent: {
          DEFAULT: "#0d9488",
          muted: "#ccfbf1",
          foreground: "#0f766e",
        },
      },
      boxShadow: {
        soft: "0 20px 45px rgba(15, 23, 42, 0.14)",
        card: "0 1px 0 rgba(15, 23, 42, 0.04), 0 12px 32px rgba(15, 23, 42, 0.08)",
        chart: "inset 0 1px 0 rgba(255,255,255,0.8), 0 1px 2px rgba(15, 23, 42, 0.06)",
      },
      backgroundImage: {
        hero: "linear-gradient(135deg, rgba(16, 24, 40, 0.72), rgba(12, 74, 110, 0.52))",
        section: "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(239,246,255,0.88))",
        mesh:
          "radial-gradient(at 0% 0%, rgba(13, 148, 136, 0.08) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(59, 130, 246, 0.06) 0px, transparent 45%)",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"Noto Sans KR"', "system-ui", "sans-serif"],
      },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
