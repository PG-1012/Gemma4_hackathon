import type { Config } from "tailwindcss";
import { heroui } from "@heroui/react";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    // npm nests @heroui/theme under @heroui/react (not hoisted), so the default
    // glob misses it and no HeroUI component CSS gets generated. Match the
    // nested location so Tailwind JIT scans HeroUI's variant class strings.
    "./node_modules/@heroui/react/node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
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
          900: "#0a0a0c", // page background — neutral near-black
          800: "#161618", // panels / cards
          700: "#1d1d20",
          600: "#2a2a2e", // borders
          500: "#3a3a40", // dividers
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
  plugins: [
    // cast: HeroUI bundles its own tailwindcss types, which don't structurally
    // match this project's Config["plugins"] type. Runtime is unaffected.
    heroui({
      themes: {
        dark: {
          colors: {
            background: "#0a0a0c",
            foreground: "#e6ebf5",
            focus: "#00e5a0",
            content1: "#161618",
            content2: "#1d1d20",
            content3: "#2a2a2e",
            primary: { DEFAULT: "#00e5a0", foreground: "#04140f" },
            secondary: { DEFAULT: "#06b6d4", foreground: "#04140f" },
            success: { DEFAULT: "#22c55e", foreground: "#04140f" },
            warning: { DEFAULT: "#f59e0b", foreground: "#0a0e16" },
            danger: { DEFAULT: "#ef4444", foreground: "#ffffff" },
          },
        },
      },
    }) as Config["plugins"] extends (infer P)[] ? P : never,
  ],
};

export default config;
