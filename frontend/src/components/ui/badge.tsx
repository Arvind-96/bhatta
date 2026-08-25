import { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
  {
    variants: {
      variant: {
        neutral: "bg-ink-primary/5 text-ink-secondary border border-border",
        good: "bg-status-good/15 text-status-good border border-status-good/20",
        warning: "bg-status-warning/15 text-status-warning border border-status-warning/20",
        critical: "bg-status-critical/15 text-status-critical border border-status-critical/20",
        // Electric accent — live/real-time indicators only (e.g. the
        // Topbar connection badge), matching the accent's "signal, not
        // wallpaper" rule elsewhere in the design system.
        live: "bg-[color-mix(in_srgb,var(--neon)_15%,transparent)] text-[var(--neon)] border border-[color-mix(in_srgb,var(--neon)_35%,transparent)] shadow-[0_0_14px_-5px_var(--neon-glow)]",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
