// Keyboard keys, as shortcuts are shown in menus, tooltips and the command palette.
import { cx } from "./cx";

export interface KbdProps {
  /** One entry per key, already in display form: `["Ctrl", "K"]` or `["⌘", "K"]`. */
  keys: string[];
  className?: string | undefined;
}

export function Kbd({ keys, className }: KbdProps) {
  return (
    <kbd className={cx("inline-flex items-center gap-0.5 font-sans not-italic", className)}>
      {keys.map((key) => (
        <span
          key={key}
          className={
            "inline-grid h-4.5 min-w-4.5 place-items-center rounded-xs bg-surface-3 px-1 text-2xs leading-none " +
            "font-medium text-fg-subtle shadow-sm ring-1 ring-line-subtle ring-inset"
          }
        >
          {key}
        </span>
      ))}
    </kbd>
  );
}
