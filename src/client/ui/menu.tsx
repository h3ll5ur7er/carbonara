// Menus: a dropdown opened from a trigger, and a context menu opened by right-click or the context-menu key.
// Both share one look; items show an optional icon and the action's shortcut.
import * as RadixContextMenu from "@radix-ui/react-context-menu";
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Kbd } from "./kbd";
import { popoverSurface } from "./popover";

const item = cx(
  "group/item flex h-7 cursor-default items-center gap-2 rounded-sm pr-1.5 pl-2 text-sm text-fg-muted outline-none select-none",
  "data-highlighted:bg-accent-soft data-highlighted:text-fg data-disabled:pointer-events-none data-disabled:opacity-45",
  "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-subtle data-highlighted:[&_svg]:text-accent-fg",
);
const label = "px-2 pt-1.5 pb-1 text-2xs font-medium tracking-wide text-fg-faint uppercase";
const separator = "-mx-1 my-1 h-px bg-line-subtle";

export interface MenuItemProps {
  children: ReactNode;
  icon?: ReactNode;
  /** Keys as `Kbd` shows them. */
  shortcut?: string[] | undefined;
  disabled?: boolean | undefined;
  onSelect?: (() => void) | undefined;
}

function ItemContent({ icon, shortcut, children }: Pick<MenuItemProps, "icon" | "shortcut" | "children">) {
  return (
    <>
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <Kbd keys={shortcut} className="ml-4" />}
    </>
  );
}

/* ---------- Dropdown menu ---------- */

export const Menu = RadixDropdownMenu.Root;
export const MenuTrigger = RadixDropdownMenu.Trigger;

export function MenuContent({
  children,
  align = "start",
  className,
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <RadixDropdownMenu.Portal>
      <RadixDropdownMenu.Content
        align={align}
        sideOffset={6}
        collisionPadding={8}
        className={cx(popoverSurface, "origin-(--radix-dropdown-menu-content-transform-origin) p-1", className)}
      >
        {children}
      </RadixDropdownMenu.Content>
    </RadixDropdownMenu.Portal>
  );
}

export function MenuItem({ icon, shortcut, disabled, onSelect, children }: MenuItemProps) {
  return (
    <RadixDropdownMenu.Item
      className={item}
      {...(disabled === undefined ? {} : { disabled })}
      {...(onSelect ? { onSelect } : {})}
    >
      <ItemContent icon={icon} shortcut={shortcut}>
        {children}
      </ItemContent>
    </RadixDropdownMenu.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <RadixDropdownMenu.Label className={label}>{children}</RadixDropdownMenu.Label>;
}

export function MenuSeparator() {
  return <RadixDropdownMenu.Separator className={separator} />;
}

/* ---------- Context menu ---------- */

export const ContextMenu = RadixContextMenu.Root;
export const ContextMenuTrigger = RadixContextMenu.Trigger;

export function ContextMenuContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <RadixContextMenu.Portal>
      <RadixContextMenu.Content
        collisionPadding={8}
        className={cx(popoverSurface, "origin-(--radix-context-menu-content-transform-origin) p-1", className)}
      >
        {children}
      </RadixContextMenu.Content>
    </RadixContextMenu.Portal>
  );
}

export function ContextMenuItem({ icon, shortcut, disabled, onSelect, children }: MenuItemProps) {
  return (
    <RadixContextMenu.Item
      className={item}
      {...(disabled === undefined ? {} : { disabled })}
      {...(onSelect ? { onSelect } : {})}
    >
      <ItemContent icon={icon} shortcut={shortcut}>
        {children}
      </ItemContent>
    </RadixContextMenu.Item>
  );
}

export function ContextMenuLabel({ children }: { children: ReactNode }) {
  return <RadixContextMenu.Label className={label}>{children}</RadixContextMenu.Label>;
}

export function ContextMenuSeparator() {
  return <RadixContextMenu.Separator className={separator} />;
}
