import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // AI side accent (cyber green) + neutral human side
        ai: {
          DEFAULT: "#00e5a0",
          dim: "#0c4a3a",
        },
        human: {
          DEFAULT: "#cbd5e1",
        },
        ink: {
          900: "#0a0e16",
          800: "#0f1422",
          700: "#161c2c",
          600: "#1e2638",
          500: "#2a3346",
        },
        planner: "#6366f1",
        executor: "#06b6d4",
        verifier: "#22c55e",
        recovery: "#f59e0b",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      keyframes: {
        "pulse-ring": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(0,229,160,0.55)" },
          "50%": { boxShadow: "0 0 0 6px rgba(0,229,160,0)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "agent-glow": {
          "0%, 100%": { borderColor: "currentColor", opacity: "1" },
          "50%": { opacity: "0.45" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 1.1s ease-in-out infinite",
        "fade-up": "fade-up 0.25s ease-out",
        "agent-glow": "agent-glow 1s ease-in-out infinite",
        shimmer: "shimmer 1.4s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
