// The command palette (Ctrl+K): every registered command, and with a document open, quick-add by item or
// recipe name. Type to filter, arrow keys to move, Enter to run, Escape to close.
import * as RadixDialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { CornerDownLeft, Plus, Search } from "lucide-react";
import { useState } from "react";
import type { CommandDefinition, CommandRegistry } from "../../core/commands";
import { formatShortcut, type Platform } from "../../core/commands-shortcuts";
import { cx } from "../../ui/cx";
import { Kbd } from "../../ui/kbd";
import { setPaletteOpen, usePalette } from "./palette-store";
import type { QuickAdd } from "./use-quick-add";

/** The palette's own command; listing it inside the palette would only close it. */
export const paletteCommandId = "palette.toggle";

export interface CommandPaletteProps {
  registry: CommandRegistry;
  platform: Platform;
  /** Null while no document is open (or its pack is still loading). */
  quickAdd: QuickAdd | null;
}

const item = cx(
  "group/item flex h-9 cursor-default items-center gap-3 rounded-md px-2.5 text-sm text-fg-muted select-none",
  "data-[selected=true]:bg-accent-soft data-[selected=true]:text-fg",
);

const groupHeading =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1.5 " +
  "[&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide " +
  "[&_[cmdk-group-heading]]:text-fg-faint [&_[cmdk-group-heading]]:uppercase";

export function CommandPalette({ registry, platform, quickAdd }: CommandPaletteProps) {
  const open = usePalette((state) => state.open);
  const [search, setSearch] = useState("");
  const groups = registry
    .groups()
    .map(([group, commands]) => [group, commands.filter((command) => command.id !== paletteCommandId)] as const)
    .filter(([, commands]) => commands.length > 0);

  function close() {
    setPaletteOpen(false);
    setSearch("");
  }

  function run(command: CommandDefinition) {
    close();
    command.run();
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={(next) => (next ? setPaletteOpen(true) : close())}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-scrim" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className={cx(
            "fixed top-[12vh] left-1/2 z-50 w-160 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden",
            "rounded-xl bg-glass shadow-overlay backdrop-blur-glass backdrop-saturate-150",
          )}
        >
          <RadixDialog.Title className="sr-only">Command palette</RadixDialog.Title>
          <Command label="Commands" loop className="flex animate-pop-in flex-col">
            <div className="flex h-13 items-center gap-3 border-b border-line-subtle px-4">
              <Search className="size-4.5 shrink-0 text-fg-subtle" aria-hidden />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder={quickAdd ? "Add an item or recipe, or run a command…" : "Run a command…"}
                className="h-full min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-faint"
              />
              <Kbd keys={["Esc"]} />
            </div>
            <Command.List className={cx("max-h-96 scroll-py-2 overflow-y-auto p-2", groupHeading)}>
              <Command.Empty className="px-3 py-8 text-center text-sm text-fg-subtle">
                Nothing matches “{search}”.
              </Command.Empty>
              {quickAdd && search.trim() && (
                <Command.Group heading="Add to factory">
                  {quickAdd.entries.map((entry) => (
                    <Command.Item
                      key={entry.recipeId}
                      value={`add ${entry.recipeId}`}
                      keywords={[entry.title, ...entry.keywords]}
                      onSelect={() => {
                        close();
                        quickAdd.add(entry);
                      }}
                      className={item}
                    >
                      <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-accent-soft text-accent-fg">
                        <Plus className="size-3.5" aria-hidden />
                      </span>
                      <span className="shrink-0 text-fg">{entry.title}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-fg-subtle">{entry.detail}</span>
                      <EnterHint />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {groups.map(([group, commands]) => (
                <Command.Group key={group} heading={group}>
                  {commands.map((command) => (
                    <Command.Item
                      key={command.id}
                      value={command.id}
                      keywords={[command.title, ...(command.keywords ?? [])]}
                      onSelect={() => run(command)}
                      className={item}
                    >
                      <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-surface-3 text-fg-subtle group-data-[selected=true]/item:text-accent-fg">
                        {command.icon && <command.icon className="size-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{command.title}</span>
                      {command.shortcut && <Kbd keys={formatShortcut(command.shortcut, platform)} />}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
            <footer className="flex items-center gap-4 border-t border-line-subtle bg-surface-1/40 px-4 py-2 text-2xs text-fg-subtle">
              <span className="flex items-center gap-1.5">
                <Kbd keys={["↑", "↓"]} /> to move
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd keys={["↵"]} /> to run
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd keys={["Esc"]} /> to close
              </span>
            </footer>
          </Command>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function EnterHint() {
  return (
    <CornerDownLeft
      className="size-3.5 shrink-0 text-accent-fg opacity-0 group-data-[selected=true]/item:opacity-100"
      aria-hidden
    />
  );
}
