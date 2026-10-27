// Tabs as a segmented control: arrow keys move between tabs, Tab moves into the panel.
import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cx } from "./cx";

export const Tabs = RadixTabs.Root;
export const TabsContent = RadixTabs.Content;

export function TabsList({
  children,
  className,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <RadixTabs.List
      {...(ariaLabel === undefined ? {} : { "aria-label": ariaLabel })}
      className={cx(
        "inline-flex h-8 items-stretch gap-0.5 rounded-md bg-surface-3 p-0.5 inset-ring inset-ring-line-subtle",
        className,
      )}
    >
      {children}
    </RadixTabs.List>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <RadixTabs.Trigger
      value={value}
      className={cx(
        "flex flex-1 items-center justify-center gap-1.5 rounded-sm px-2.5 text-xs font-medium whitespace-nowrap text-fg-subtle",
        "transition-[background-color,color,box-shadow] select-none hover:text-fg",
        "data-[state=active]:bg-surface-1 data-[state=active]:text-fg data-[state=active]:shadow-sm",
        "focus-visible:outline-offset-0 [&_svg]:size-3.5",
      )}
    >
      {children}
    </RadixTabs.Trigger>
  );
}
