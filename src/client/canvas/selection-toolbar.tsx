// A small toolbar over the canvas while several nodes are selected: align, distribute, straighten, arrange and
// lock, one click away. Its buttons are the registered commands, so titles, icons and shortcuts match the palette.
import type { ReactNode } from "react";
import { canvasCommands, tidyCommandIds } from "./commands";
import { formatShortcut, platformOf } from "../core/commands-shortcuts";
import type { CommandDefinition } from "../core/commands";
import { IconButton } from "../ui/button";

const platform = platformOf(navigator.platform);
const byId = new Map(canvasCommands.map((command) => [command.id, command]));

/** Groups of buttons, separated by hairlines. */
const GROUPS: string[][] = [
  tidyCommandIds.slice(0, 6),
  tidyCommandIds.slice(6),
  ["arrange.leftToRight", "arrange.frameSelection", "arrange.toggleLock"],
];

export function SelectionToolbar({ left, right, multiEdit }: { left: number; right: number; multiEdit?: ReactNode }) {
  return (
    <div
      role="toolbar"
      aria-label="Selection"
      // Centred over the part of the canvas the side panels leave visible.
      style={{ left, right }}
      className="pointer-events-none absolute top-3 flex justify-center"
    >
      <div className="pointer-events-auto flex animate-pop-in items-center gap-0.5 rounded-lg bg-glass p-1 shadow-overlay backdrop-blur-glass">
        {GROUPS.map((ids, index) => (
          <div key={ids[0]} className="flex items-center gap-0.5">
            {index > 0 && <span aria-hidden className="mx-1 h-5 w-px bg-line-subtle" />}
            {ids.flatMap((id) => {
              const command = byId.get(id);
              return command ? [<ToolbarButton key={id} command={command} />] : [];
            })}
          </div>
        ))}
        {multiEdit && (
          <>
            <span aria-hidden className="mx-1 h-5 w-px bg-line-subtle" />
            {multiEdit}
          </>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({ command }: { command: CommandDefinition }) {
  const Icon = command.icon;
  return (
    <IconButton
      size="sm"
      label={command.title}
      shortcut={command.shortcut ? formatShortcut(command.shortcut, platform) : undefined}
      icon={Icon ? <Icon /> : null}
      onClick={() => command.run()}
    />
  );
}
