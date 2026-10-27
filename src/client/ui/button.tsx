// Buttons: text buttons in four variants and square icon buttons that always carry a label and a tooltip.
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import { Tooltip } from "./tooltip";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const base =
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium " +
  "transition-[background-color,color,box-shadow,opacity] disabled:pointer-events-none disabled:opacity-45 " +
  "[&_svg]:size-4 [&_svg]:shrink-0";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent shadow-sm hover:bg-accent-hover active:brightness-95",
  secondary: "bg-surface-3 text-fg shadow-sm inset-ring inset-ring-line hover:bg-surface-4 active:bg-surface-4",
  ghost: "text-fg-muted hover:bg-surface-3 hover:text-fg active:bg-surface-4 aria-expanded:bg-surface-3",
  danger: "bg-danger-soft text-danger inset-ring inset-ring-danger/25 hover:bg-danger/20 active:bg-danger/25",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-3 text-sm",
};

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "secondary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cx(base, variants[variant], sizes[size], className)} {...props} />;
}

const iconSizes: Record<ButtonSize, string> = { sm: "size-7", md: "size-8" };

export interface IconButtonProps extends Omit<ComponentProps<"button">, "children"> {
  /** Names the action for screen readers and in the tooltip. */
  label: string;
  /** Keys shown in the tooltip, as `Kbd` renders them. */
  shortcut?: string[] | undefined;
  icon: ReactNode;
  variant?: Exclude<ButtonVariant, "primary">;
  size?: ButtonSize;
  /** Off where a tooltip would open on its own, e.g. on a button that receives focus when a dialog opens. */
  tooltip?: boolean;
}

export function IconButton({
  label,
  shortcut,
  icon,
  variant = "ghost",
  size = "md",
  tooltip = true,
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      className={cx(base, variants[variant], iconSizes[size], className)}
      {...props}
    >
      {icon}
    </button>
  );
  return tooltip ? (
    <Tooltip content={label} shortcut={shortcut}>
      {button}
    </Tooltip>
  ) : (
    button
  );
}
