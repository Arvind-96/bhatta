import type { Config } from "tailwindcss";

// Every design-token color below resolves through a CSS custom property
// (so both themes/.dark can repaint it at runtime) — but a bare `var(--x)`
// string is opaque to Tailwind's opacity-modifier machinery (`bg-x/15`,
// `border-x/40`, ...): Tailwind can't inject an alpha channel into a
// variable it can't see inside, so it silently drops the utility instead
// of erroring. That's why every `/N`-suffixed utility on these colors —
// bg-ink-primary/15, bg-series-1/15, border-status-critical/25, and every
// other opacity-modified use of these tokens app-wide — has been
// generating no CSS at all. Wrapping each color in this Tailwind
// "color as a function" form (documented for exactly this case) fixes
// every one of those utilities at once: full-strength (`bg-ink-primary`)
// still resolves to the plain variable unchanged, while an opacity
// modifier switches it to color-mix (already used by hand throughout
// index.css, so the same browser-support baseline applies).
function withOpacity(variable: string) {
  return ({ opacityValue }: { opacityValue?: string }) =>
    opacityValue === undefined ? `var(${variable})` : `color-mix(in srgb, var(${variable}) calc(${opacityValue} * 100%), transparent)`;
}

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: withOpacity("--surface"),
        "surface-raised": withOpacity("--surface-raised"),
        plane: withOpacity("--plane"),
        border: withOpacity("--border-hairline"),
        ink: {
          primary: withOpacity("--ink-primary"),
          secondary: withOpacity("--ink-secondary"),
          muted: withOpacity("--ink-muted"),
        },
        sidebar: {
          DEFAULT: withOpacity("--sidebar"),
          raised: withOpacity("--sidebar-raised"),
          ink: withOpacity("--sidebar-ink"),
          "ink-soft": withOpacity("--sidebar-ink-soft"),
          "ink-faint": withOpacity("--sidebar-ink-faint"),
          line: withOpacity("--sidebar-line"),
        },
        series: {
          1: withOpacity("--series-1"),
          2: withOpacity("--series-2"),
          3: withOpacity("--series-3"),
          4: withOpacity("--series-4"),
          5: withOpacity("--series-5"),
          6: withOpacity("--series-6"),
        },
        status: {
          good: withOpacity("--status-good"),
          warning: withOpacity("--status-warning"),
          serious: withOpacity("--status-serious"),
          critical: withOpacity("--status-critical"),
        },
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      // Registers the app's two brand gradients as real Tailwind
      // `bg-gradient-*` utilities (bg-gradient-brand, bg-gradient-accent2,
      // usable with hover:/dark: variants like any other utility) — the
      // plain `.gradient-brand`/`.gradient-accent2` CSS classes in
      // index.css still exist unchanged for the many components that use
      // them as bare classNames; this is purely additive.
      backgroundImage: {
        "gradient-brand": "var(--gradient-brand)",
        "gradient-accent2": "var(--gradient-accent2)",
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
        // IBM Plex Sans for body copy and UI chrome — a technical,
        // enterprise-grade humanist face that reads as "instrument," not
        // "app" (part of the "Bhatta Ledger" redesign — see index.css's
        // top-of-file note on the palette this replaced).
        sans: ["IBM Plex Sans", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        // Barlow Condensed reserved for headings/brand moments and
        // uppercase tracked labels (page titles, gauge-cluster captions)
        // — a condensed industrial face matching the instrument-panel
        // direction; used sparingly via `font-display`, not globally.
        display: ["Barlow Condensed", "IBM Plex Sans", "system-ui", "sans-serif"],
        // Every rupee figure in a table/stat column — true tabular
        // ledger-column alignment, applied via `font-mono`/`.mono`
        // alongside the existing `tabular-nums` convention.
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
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
