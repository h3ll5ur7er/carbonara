// The app's top bar: the app menu behind the wordmark, open documents, the command palette's search field,
// panel toggles and the theme. Titles and shortcuts come from the command registry.
import { ChevronDown, Search } from "lucide-react";
import type { ReactNode } from "react";
import type { CommandRegistry } from "./core/commands";
import { formatShortcut, type Platform } from "./core/commands-shortcuts";
import { Packs } from "./features/packs/packs";
import { paletteCommandId } from "./features/command-palette/command-palette";
import { setPaletteOpen } from "./features/command-palette/palette-store";
import { usePanels } from "./shell/panels";
import { Kbd } from "./ui/kbd";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "./ui/menu";
import { ThemeToggle } from "./ui/theme-toggle";
import { Toggle } from "./ui/toggle";

export interface TopBarProps {
  documentName: string;
  /** The open documents' tabs; a single static tab named `documentName` when left out (scenes). */
  tabs?: ReactNode;
  registry: CommandRegistry;
  platform: Platform;
}

export function TopBar({ documentName, tabs, registry, platform }: TopBarProps) {
  const leftOpen = usePanels((panels) => panels.left.open);
  const rightOpen = usePanels((panels) => panels.right.open);
  const keys = (id: string) => {
    const shortcut = registry.get(id)?.shortcut;
    return shortcut ? formatShortcut(shortcut, platform) : undefined;
  };
  const panelToggle = (id: string, pressed: boolean, label: string) => {
    const command = registry.get(id);
    return (
      command?.icon && (
        <Toggle
          label={label}
          shortcut={keys(id)}
          pressed={pressed}
          onPressedChange={() => command.run()}
          icon={<command.icon />}
        />
      )
    );
  };

  return (
    <header className="relative flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface-1 px-3">
      <AppMenu registry={registry} platform={platform} />
      <div className="h-5 w-px bg-line" aria-hidden />
      {tabs ?? (
        <nav aria-label="Documents" className="flex min-w-0 items-center">
          <span className="flex h-8 items-center gap-2 rounded-md bg-surface-3 px-3 text-sm font-medium text-fg shadow-sm">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden />
            <span className="truncate">{documentName}</span>
          </span>
        </nav>
      )}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className={
          "absolute left-1/2 flex h-8 w-80 -translate-x-1/2 items-center gap-2 rounded-md bg-surface-2 pr-1.5 pl-2.5 " +
          "text-sm text-fg-faint inset-ring inset-ring-line transition-colors hover:text-fg-subtle hover:inset-ring-line-strong"
        }
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Search or run a command…</span>
        {keys(paletteCommandId) && <Kbd keys={keys(paletteCommandId) ?? []} />}
      </button>
      <div className="ml-auto flex items-center gap-1">
        {panelToggle("view.toggleLibrary", leftOpen, "Library")}
        {panelToggle("view.toggleInspector", rightOpen, "Inspector")}
        <div className="mx-1 h-5 w-px bg-line" aria-hidden />
        <Packs />
        <ThemeToggle shortcut={keys("view.toggleTheme")} />
      </div>
    </header>
  );
}

/** Every command by group, with its shortcut: the menu-bar view of the registry. */
function AppMenu({ registry, platform }: { registry: CommandRegistry; platform: Platform }) {
  return (
    <Menu>
      <MenuTrigger
        aria-label="App menu"
        className="group/menu -ml-1 flex h-8 items-center gap-2 rounded-md pr-1.5 pl-1 transition-colors hover:bg-surface-3 aria-expanded:bg-surface-3"
      >
        <Wordmark />
        <ChevronDown className="size-3.5 text-fg-subtle transition-transform group-aria-expanded/menu:rotate-180" />
      </MenuTrigger>
      <MenuContent className="min-w-64">
        {registry.groups().map(([group, commands], index) => (
          <div key={group} role="group" aria-label={group}>
            {index > 0 && <MenuSeparator />}
            <MenuLabel>{group}</MenuLabel>
            {commands.map((command) => (
              <MenuItem
                key={command.id}
                icon={command.icon && <command.icon />}
                shortcut={command.shortcut ? formatShortcut(command.shortcut, platform) : undefined}
                onSelect={command.run}
              >
                {command.title}
              </MenuItem>
            ))}
          </div>
        ))}
      </MenuContent>
    </Menu>
  );
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 24 24" className="size-6 drop-shadow-glow" aria-hidden>
        <rect width="24" height="24" rx="6.5" className="fill-accent" />
        <path d="M7 8.5C12 8.5 12 15.5 17 15.5" fill="none" strokeWidth="2" className="stroke-on-accent" />
        <circle cx="7" cy="8.5" r="2.5" className="fill-on-accent" />
        <circle cx="17" cy="15.5" r="2.5" className="fill-on-accent" />
      </svg>
      <span className="text-base font-semibold tracking-tight text-fg">Carbonara</span>
    </span>
  );
}
