// Text inputs, and the inset look every editable field shares (inputs, number inputs, select triggers).
import type { ComponentProps } from "react";
import { cx } from "./cx";

/**
 * A recessed well with a hairline that brightens on hover; while focused (itself or a control inside it),
 * the hairline turns accent and a soft accent halo replaces the global focus outline.
 */
export const fieldSurface = cx(
  "rounded-md bg-surface-2 text-sm text-fg inset-shadow-well inset-ring inset-ring-line",
  "transition-[box-shadow,background-color] hover:inset-ring-line-strong",
  "focus-visible:inset-ring-accent focus-visible:ring-3 focus-visible:ring-accent-soft focus-visible:outline-none",
  "has-focus-visible:inset-ring-accent has-focus-visible:ring-3 has-focus-visible:ring-accent-soft",
  "aria-invalid:inset-ring-danger disabled:opacity-45 has-disabled:opacity-45 data-disabled:opacity-45",
);

export type InputSize = "sm" | "md";

const sizes: Record<InputSize, string> = { sm: "h-7 px-2 text-xs", md: "h-8 px-2.5" };

export interface InputProps extends Omit<ComponentProps<"input">, "size"> {
  size?: InputSize;
}

export function Input({ size = "md", className, ...props }: InputProps) {
  return <input className={cx(fieldSurface, sizes[size], "min-w-0 placeholder:text-fg-faint", className)} {...props} />;
}
