import { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none",
  {
    variants: {
      variant: {
        primary:
          "btn-shine gradient-brand text-white shadow-glow-1 hover:shadow-glow-1-lg hover:-translate-y-0.5 active:translate-y-0",
        // Reserved for the single highest-stakes action on a screen (e.g.
        // "Generate Invoice") — the electric secondary accent, never used
        // as a resting/default color so it stays a signal, not wallpaper.
        accent:
          "btn-shine gradient-accent2 text-white shadow-[0_6px_20px_-6px_var(--neon-glow)] hover:shadow-[0_10px_26px_-6px_var(--neon-glow)] hover:-translate-y-0.5 active:translate-y-0",
        ghost: "bg-transparent text-ink-secondary hover:bg-ink-primary/5",
        outline: "border border-border text-ink-primary hover:bg-ink-primary/5 hover:border-series-1/50",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-10 px-4",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
