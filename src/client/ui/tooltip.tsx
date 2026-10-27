// Tooltips: a short label, and the shortcut when there is one. Needs a `TooltipProvider` near the root.
import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Kbd } from "./kbd";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={500} skipDelayDuration={300}>
      {children}
    </RadixTooltip.Provider>
  );
}

export interface TooltipProps {
  content: ReactNode;
  shortcut?: string[] | undefined;
  side?: "top" | "right" | "bottom" | "left";
  /** One focusable element; the tooltip opens on hover and on keyboard focus. */
  children: ReactNode;
}

export function Tooltip({ content, shortcut, side = "bottom", children }: TooltipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cx(
            "z-50 flex origin-(--radix-tooltip-content-transform-origin) animate-pop-in items-center gap-2",
            "rounded-sm bg-surface-2 py-1 pl-2 text-xs font-medium text-fg shadow-overlay select-none",
            shortcut ? "pr-1" : "pr-2",
          )}
        >
          {content}
          {shortcut && <Kbd keys={shortcut} />}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
