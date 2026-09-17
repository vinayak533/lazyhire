import type { Config } from "tailwindcss";

const color = (token: string) => `hsl(var(--${token}) / <alpha-value>)`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    fontWeight: { normal: "400", semibold: "600" },
    extend: {
      colors: {
        background: color("background"),
        foreground: color("foreground"),
        card: { DEFAULT: color("card"), foreground: color("foreground") },
        primary: {
          DEFAULT: color("primary"),
          foreground: color("primary-foreground"),
          hover: color("primary-hover"),
        },
        secondary: {
          DEFAULT: color("secondary"),
          foreground: color("foreground"),
        },
        muted: {
          DEFAULT: color("muted"),
          foreground: color("muted-foreground"),
        },
        accent: { DEFAULT: color("accent"), foreground: color("primary") },
        destructive: {
          DEFAULT: color("destructive"),
          foreground: color("primary-foreground"),
        },
        border: color("border"),
        input: color("input"),
        ring: color("primary"),
      },
      fontFamily: { sans: ["var(--font-inter)", "Arial", "sans-serif"] },
      letterSpacing: { heading: "0" },
      borderRadius: { sm: "4px", md: "6px", lg: "8px", xl: "8px" },
      spacing: {
        "4.5": "1.125rem",
        "7.5": "1.875rem",
        "13": "3.25rem",
        "18": "4.5rem",
        section: "3rem",
        gutter: "1.5rem",
      },
      boxShadow: {
        subtle: "0 1px 2px rgb(0 0 0 / 0.28)",
        elevated: "0 18px 48px rgb(0 0 0 / 0.32)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(5px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "ai-scan": {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(320%)" },
        },
        "ai-pulse": {
          "0%, 100%": { opacity: "0.45", transform: "scale(0.9)" },
          "50%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 280ms ease-out both",
        "ai-scan": "ai-scan 1.8s ease-in-out infinite",
        "ai-pulse": "ai-pulse 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
