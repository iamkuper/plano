import type { Config } from "tailwindcss";
import { color, fontSize, radius, shadow } from "./src/design/tokens";

// Generated from src/design/tokens.ts — edit tokens there, not here.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: color,
      fontSize: fontSize as unknown as Record<string, [string, string]>,
      borderRadius: radius,
      boxShadow: { ...shadow, overlay: shadow.raised },
      fontFamily: {
        sans: ["var(--font-main)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
