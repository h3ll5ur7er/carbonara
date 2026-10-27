// The cheat sheet (`?`): every command and its shortcut, read from the command registry, and where shortcuts are
// changed. Pick "Change", press the new keys (Escape cancels); a clash names the command that has them.
import { Pencil, RotateCcw, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import type { CommandDefinition } from "../../core/commands";
import { formatShortcut, platformOf } from "../../core/commands-shortcuts";
import { appRegistry } from "../../shell/app-commands";
import { IconButton } from "../../ui/button";
import { Dialog, DialogContent } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Kbd } from "../../ui/kbd";
import { TooltipProvider } from "../../ui/tooltip";
import { conflictOf, shortcutOf } from "./custom";
import { resetShortcut, setCheatSheetOpen, setShortcut, useShortcuts } from "./store";

const platform = platformOf(navigator.platform);

export function CheatSheet() {
  const open = useShortcuts((state) => state.cheatSheetOpen);
  const overrides = useShortcuts((state) => state.overrides);
  const [filter, setFilter] = useState("");
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = appRegistry
    .groups()
    .map(([group, commands]) => {
      const shown = commands.filter((command) =>
        words.every((word) => [command.title, ...(command.keywords ?? [])].join(" ").toLowerCase().includes(word)),
      );
      return [group, shown] as const;
    })
    .filter(([, commands]) => commands.length > 0);

  return (
    // Mounted beside the shell rather than inside it, so it brings its own tooltip provider.
    <TooltipProvider>
      <Dialog open={open} onOpenChange={setCheatSheetOpen}>
        <DialogContent
          title="Keyboard shortcuts"
          description="Every command and its keys. Change a shortcut to suit your hands; it's kept in this browser."
          className="w-160"
        >
          <Input
            aria-label="Filter commands"
            placeholder="Filter…"
            value={filter}
            onChange={(event) => setFilter(event.currentTarget.value)}
          />
          <div className="mt-3 flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
            {groups.map(([group, commands]) => (
              <section key={group} aria-label={group} className="flex flex-col">
                <h3 className="px-1 pb-1 text-2xs font-medium tracking-wide text-fg-faint uppercase">{group}</h3>
                {commands.map((command) => (
                  <ShortcutRow key={command.id} command={command} customised={Object.hasOwn(overrides, command.id)} />
                ))}
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

function ShortcutRow({ command, customised }: { command: CommandDefinition; customised: boolean }) {
  const [recording, setRecording] = useState(false);
  const [clash, setClash] = useState<string | null>(null);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    // Every key goes to the recording, not to the dialog or the app.
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setRecording(false);
      setClash(null);
      return;
    }
    const shortcut = shortcutOf(event, platform);
    if (!shortcut) return;
    const other = conflictOf(appRegistry.commands, command.id, shortcut);
    if (other) {
      setClash(`${formatShortcut(shortcut, platform).join(" ")} is taken by ${other.title}`);
      return;
    }
    setShortcut(command.id, shortcut);
    setRecording(false);
    setClash(null);
  }

  return (
    <div className="flex min-h-9 items-center gap-3 rounded-md px-1 hover:bg-surface-3/50">
      <span className="grid size-6 shrink-0 place-items-center text-fg-subtle">
        {command.icon && <command.icon className="size-3.5" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">
        {command.title}
        {clash && <span className="ml-2 text-xs text-danger">{clash}</span>}
      </span>
      {recording ? (
        <button
          type="button"
          autoFocus
          onKeyDown={onKeyDown}
          onBlur={() => {
            setRecording(false);
            setClash(null);
          }}
          className="h-7 rounded-sm bg-accent-soft px-2 text-xs text-accent-fg ring-1 ring-accent outline-none"
        >
          Press keys…
        </button>
      ) : command.shortcut ? (
        <Kbd keys={formatShortcut(command.shortcut, platform)} />
      ) : (
        <span className="text-xs text-fg-faint">—</span>
      )}
      <IconButton
        size="sm"
        label={`Change shortcut for ${command.title}`}
        icon={<Pencil />}
        onClick={() => setRecording(true)}
      />
      {command.shortcut && (
        <IconButton
          size="sm"
          label={`Remove shortcut for ${command.title}`}
          icon={<X />}
          onClick={() => setShortcut(command.id, null)}
        />
      )}
      {customised && (
        <IconButton
          size="sm"
          label={`Reset shortcut for ${command.title}`}
          icon={<RotateCcw />}
          onClick={() => resetShortcut(command.id)}
        />
      )}
    </div>
  );
}
