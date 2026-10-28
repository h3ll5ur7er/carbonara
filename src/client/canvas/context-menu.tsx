// Context menus on the canvas: right-click a node, a flow or empty canvas (or press Shift+F10 or the menu key)
// for the commands that apply there. The menu opens when the right button comes up without having moved, so a
// right-drag still pans on every platform. Its items are registered commands: same titles, icons and shortcuts.
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { CommandDefinition } from "../core/commands";
import { formatShortcut, platformOf } from "../core/commands-shortcuts";
import { appRegistry } from "../shell/app-commands";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/menu";
import { canvasActions } from "./viewport";

const platform = platformOf(navigator.platform);

type Target = "node" | "flow" | "canvas";

/** The commands for each place, in groups separated by a line. */
const ITEMS: Record<Target, string[][]> = {
  node: [
    ["edit.copy", "edit.cut", "edit.duplicate"],
    ["recipe.toggleFavourite"],
    ["view.zoomToSelection", "arrange.leftToRight", "align.straightenChain"],
    ["arrange.frameSelection", "arrange.toggleLock"],
    ["subgraph.collapse", "subgraph.open", "subgraph.expand"],
    ["edit.delete", "edit.deleteAndBridge"],
  ],
  flow: [["edit.delete"]],
  canvas: [
    ["edit.paste", "edit.pasteWithConnections"],
    ["edit.addNote", "edit.find"],
    ["arrange.leftToRight", "view.zoomToFit", "view.bookmark", "file.exportPng"],
    ["edit.undo", "edit.redo"],
  ],
};

/** Pointer travel, in pixels, beyond which a right-button press was a pan. */
const DRAG = 4;

interface Open {
  target: Target;
  /** Where to open, relative to the canvas. */
  x: number;
  y: number;
}

export function CanvasContextMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const area = useRef<HTMLDivElement>(null);

  const show = useCallback((element: Element | null, clientX: number, clientY: number) => {
    const bounds = area.current?.getBoundingClientRect();
    if (!bounds) return;
    const node = element?.closest<HTMLElement>(".react-flow__node");
    const flow = element?.closest<HTMLElement>(".react-flow__edge");
    // Right-clicking something outside the selection makes it the selection, as in every editor.
    const selectNode = node?.dataset.id && !node.classList.contains("selected") ? node.dataset.id : undefined;
    const selectFlow = flow?.dataset.id && !flow.classList.contains("selected") ? flow.dataset.id : undefined;
    if (selectNode) canvasActions()?.select([selectNode]);
    if (selectFlow) canvasActions()?.select([], [selectFlow]);
    const target: Target = node ? "node" : flow ? "flow" : "canvas";
    const opening = { target, x: clientX - bounds.left, y: clientY - bounds.top };
    // A new selection reaches the commands once the canvas has rendered it; the menu's titles ask them
    // ("Add to favourites"), so it opens a frame later then.
    if (selectNode || selectFlow) requestAnimationFrame(() => setOpen(opening));
    else setOpen(opening);
  }, []);

  const onPointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button === 2) down.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUpCapture = (event: PointerEvent<HTMLDivElement>) => {
    const start = down.current;
    down.current = null;
    if (event.button !== 2 || !start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG) return;
    show(document.elementFromPoint(event.clientX, event.clientY), event.clientX, event.clientY);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
    event.preventDefault();
    const focused = document.activeElement;
    const box = (
      focused instanceof HTMLElement && area.current?.contains(focused) ? focused : area.current
    )?.getBoundingClientRect();
    if (box) show(focused instanceof Element ? focused : null, box.left + box.width / 2, box.top + box.height / 2);
  };

  return (
    <div
      ref={area}
      className="relative size-full"
      // The browser's own menu has nothing for the canvas.
      onContextMenu={(event) => event.preventDefault()}
      onPointerDownCapture={onPointerDownCapture}
      onPointerUpCapture={onPointerUpCapture}
      onKeyDown={onKeyDown}
    >
      {children}
      <Menu open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <MenuTrigger asChild>
          <span aria-hidden className="pointer-events-none absolute size-0" style={{ left: open?.x, top: open?.y }} />
        </MenuTrigger>
        {open && (
          <MenuContent>
            {ITEMS[open.target].map((ids, index) => (
              <MenuGroup key={ids.join()} ids={ids} separated={index > 0} />
            ))}
          </MenuContent>
        )}
      </Menu>
    </div>
  );
}

function MenuGroup({ ids, separated }: { ids: string[]; separated: boolean }) {
  const commands = ids.flatMap((id) => {
    const command = appRegistry.get(id);
    const title = command?.menuTitle ? command.menuTitle() : command?.title;
    return command && title ? [{ command, title }] : [];
  });
  if (commands.length === 0) return null;
  return (
    <>
      {separated && <MenuSeparator />}
      {commands.map(({ command, title }) => (
        <CommandItem key={command.id} command={command} title={title} />
      ))}
    </>
  );
}

function CommandItem({ command, title }: { command: CommandDefinition; title: string }) {
  const Icon = command.icon;
  return (
    <MenuItem
      icon={Icon ? <Icon /> : undefined}
      shortcut={command.shortcut ? formatShortcut(command.shortcut, platform) : undefined}
      onSelect={() => command.run()}
    >
      {title}
    </MenuItem>
  );
}
