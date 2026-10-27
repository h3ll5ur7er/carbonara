// A select for a short list of options, opened with the pointer or with Space, Enter and the arrow keys.
import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronsUpDown } from "lucide-react";
import { cx } from "./cx";
import { fieldSurface } from "./input";
import { popoverSurface } from "./popover";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  options: SelectOption[];
  onValueChange(value: string): void;
  size?: "sm" | "md";
  disabled?: boolean | undefined;
  id?: string | undefined;
  className?: string | undefined;
  "aria-label"?: string | undefined;
  "aria-labelledby"?: string | undefined;
}

export function Select({ value, options, onValueChange, size = "md", disabled, id, className, ...aria }: SelectProps) {
  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange} {...(disabled === undefined ? {} : { disabled })}>
      <RadixSelect.Trigger
        id={id}
        {...aria}
        className={cx(
          fieldSurface,
          "flex min-w-0 items-center justify-between gap-2 text-left",
          size === "sm" ? "h-7 pr-1.5 pl-2 text-xs" : "h-8 pr-2 pl-2.5",
          "data-placeholder:text-fg-faint",
          className,
        )}
      >
        <span className="truncate">
          <RadixSelect.Value />
        </span>
        <RadixSelect.Icon className="shrink-0 text-fg-subtle">
          <ChevronsUpDown className="size-3.5" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          className={cx(
            popoverSurface,
            "max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width)",
            "origin-(--radix-select-content-transform-origin)",
          )}
        >
          <RadixSelect.Viewport className="p-1">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                className={cx(
                  "relative flex h-7 cursor-default items-center rounded-sm pr-8 pl-2 text-sm text-fg-muted outline-none select-none",
                  "data-highlighted:bg-accent-soft data-highlighted:text-fg data-[state=checked]:text-fg",
                )}
              >
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="absolute right-2 text-accent-fg">
                  <Check className="size-3.5" />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
