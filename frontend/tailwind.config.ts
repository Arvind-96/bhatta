import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        plane: "var(--plane)",
        border: "var(--border-hairline)",
        ink: {
          primary: "var(--ink-primary)",
          secondary: "var(--ink-secondary)",
          muted: "var(--ink-muted)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          raised: "var(--sidebar-raised)",
          ink: "var(--sidebar-ink)",
          "ink-soft": "var(--sidebar-ink-soft)",
          "ink-faint": "var(--sidebar-ink-faint)",
          line: "var(--sidebar-line)",
        },
        series: {
          1: "var(--series-1)",
          2: "var(--series-2)",
          3: "var(--series-3)",
          4: "var(--series-4)",
          5: "var(--series-5)",
          6: "var(--series-6)",
        },
        status: {
          good: "var(--status-good)",
          warning: "var(--status-warning)",
          serious: "var(--status-serious)",
          critical: "var(--status-critical)",
        },
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      boxShadow: {
        glass: "var(--shadow-glass)",
        // A colored glow per series tone — used on the active nav pill,
        // primary buttons, and stat-card accents so the "vivid" palette
        // actually glows instead of sitting flat. --glow-N in index.css
        // holds each tone's own tinted shadow color.
        "glow-1": "0 4px 14px -4px var(--glow-1), 0 2px 6px -2px var(--glow-1)",
        "glow-2": "0 4px 14px -4px var(--glow-2), 0 2px 6px -2px var(--glow-2)",
        "glow-3": "0 4px 14px -4px var(--glow-3), 0 2px 6px -2px var(--glow-3)",
        "glow-4": "0 4px 14px -4px var(--glow-4), 0 2px 6px -2px var(--glow-4)",
        "glow-5": "0 4px 14px -4px var(--glow-5), 0 2px 6px -2px var(--glow-5)",
        "glow-6": "0 4px 14px -4px var(--glow-6), 0 2px 6px -2px var(--glow-6)",
        "glow-1-lg": "0 10px 26px -8px var(--glow-1), 0 4px 10px -4px var(--glow-1)",
      },
      backdropBlur: {
        glass: "16px",
      },
      fontFamily: {
        // Inter for body copy, UI chrome, and all numeric/data display —
        // smooth, highly legible at small sizes, reads clean in a dense
        // dashboard.
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        // Poppins reserved for headings/brand moments (page titles, the
        // login wordmark) — a rounder, friendlier geometric face that
        // matches the vivid, colorful direction better than a neutral
        // grotesque; used sparingly via `font-display`, not globally.
        display: ["Poppins", "Inter", "system-ui", "sans-serif"],
      },
      keyframes: {
        "pulse-ring": {
          "0%, 100%": { boxShadow: "0 0 0 0 var(--glow-pulse)" },
          "50%": { boxShadow: "0 0 0 5px transparent" },
        },
        rise: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
        "gradient-flow": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 1.8s ease-in-out infinite",
        rise: "rise 0.4s ease both",
        float: "float 3s ease-in-out infinite",
        "gradient-flow": "gradient-flow 6s ease infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
