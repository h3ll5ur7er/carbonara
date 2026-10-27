// Two-state controls: a pressed/unpressed icon button for toolbars, and a switch for on/off settings.
import * as RadixSwitch from "@radix-ui/react-switch";
import * as RadixToggle from "@radix-ui/react-toggle";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Tooltip } from "./tooltip";

export interface ToggleProps {
  pressed: boolean;
  onPressedChange(pressed: boolean): void;
  /** Names what the toggle shows or turns on, for screen readers and in the tooltip. */
  label: string;
  shortcut?: string[] | undefined;
  icon: ReactNode;
}

export function Toggle({ pressed, onPressedChange, label, shortcut, icon }: ToggleProps) {
  return (
    <Tooltip content={label} shortcut={shortcut}>
      <RadixToggle.Root
        pressed={pressed}
        onPressedChange={onPressedChange}
        aria-label={label}
        className={cx(
          "grid size-8 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors",
          "hover:bg-surface-3 hover:text-fg active:bg-surface-4 [&_svg]:size-4",
          // By aria-pressed: the tooltip trigger replaces the toggle's data-state with its own.
          "aria-pressed:bg-accent-soft aria-pressed:text-accent-fg",
        )}
      >
        {icon}
      </RadixToggle.Root>
    </Tooltip>
  );
}

export interface SwitchProps {
  checked: boolean;
  onCheckedChange(checked: boolean): void;
  disabled?: boolean | undefined;
  id?: string | undefined;
  "aria-label"?: string | undefined;
  "aria-labelledby"?: string | undefined;
}

export function Switch({ checked, onCheckedChange, disabled, id, ...aria }: SwitchProps) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      {...(disabled === undefined ? {} : { disabled })}
      {...(id === undefined ? {} : { id })}
      {...aria}
      className={cx(
        "group/switch inline-flex h-4.5 w-8 shrink-0 items-center rounded-full bg-surface-4 p-0.5 inset-ring inset-ring-line",
        "transition-colors data-[state=checked]:bg-accent data-[state=checked]:inset-ring-transparent",
        "focus-visible:ring-3 focus-visible:ring-accent-glow focus-visible:outline-none disabled:opacity-45",
      )}
    >
      <RadixSwitch.Thumb
        className={cx(
          "block size-3.5 rounded-full bg-knob shadow-knob transition-transform duration-(--duration-base)",
          "data-[state=checked]:translate-x-3.5",
        )}
      />
    </RadixSwitch.Root>
  );
}
