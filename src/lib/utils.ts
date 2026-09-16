import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Registers the `cis-*` design tokens (tailwind.config.js theme.extend) with
// tailwind-merge so it can dedupe them against shadcn's default classes
// (e.g. `rounded-cis-pill` vs. `rounded-md`) instead of silently keeping both
// or misclassifying a size as a color.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        "cis-orange", "cis-orange-hover", "cis-orange-press", "cis-orange-shadow", "cis-orange-text", "cis-orange-deep",
        "cis-ember", "cis-ember-tint",
        "cis-sage", "cis-sage-hover", "cis-sage-press", "cis-sage-tint", "cis-sage-text", "cis-sage-ink",
        "cis-apricot", "cis-apricot-tint",
        "cis-page",
        "cis-paper", "cis-paper-light",
        "cis-rule", "cis-rule-soft",
        "cis-track",
        "cis-ink", "cis-ink-dark", "cis-ink-muted", "cis-ink-on-dark", "cis-ink-on-dark-muted",
        "cis-board", "cis-board-tab", "cis-board-hole",
      ],
      radius: ["cis-chip", "cis-box", "cis-sheet", "cis-shell", "cis-pill"],
      text: ["cis-xs", "cis-sm", "cis-base", "cis-md", "cis-lg", "cis-xl", "cis-display-md", "cis-display-lg"],
      spacing: ["cis-1", "cis-2", "cis-3", "cis-4", "cis-5", "cis-6", "cis-tap-min", "cis-tap-primary"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
