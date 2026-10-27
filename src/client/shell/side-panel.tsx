// A side panel floating over the canvas: frosted glass, a header with a close button, a resizable inner edge.
import { X } from "lucide-react";
import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { IconButton } from "../ui/button";
import { cx } from "../ui/cx";
import { dragPanelWidth, panelWidths, separatorKey, type PanelSide } from "./panel-layout";
import { setPanelOpen, setPanelWidth, usePanels } from "./panels";

export interface SidePanelProps {
  side: PanelSide;
  title: string;
  /** Keys of the command that toggles the panel, shown on the close button. */
  shortcut?: string[] | undefined;
  children: ReactNode;
}

export function SidePanel({ side, title, shortcut, children }: SidePanelProps) {
  const { open, width } = usePanels((panels) => panels[side]);
  if (!open) return null;
  return (
    <aside
      aria-label={title}
      style={{ width }}
      className={cx(
        "absolute inset-y-3 z-10 flex animate-fade-in flex-col rounded-xl bg-glass shadow-panel",
        "backdrop-blur-glass backdrop-saturate-150",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line-subtle pr-1.5 pl-4">
        <h2 className="flex-1 truncate text-xs font-semibold tracking-wide text-fg-muted uppercase">{title}</h2>
        <IconButton
          label={`Close ${title.toLowerCase()}`}
          shortcut={shortcut}
          icon={<X />}
          size="sm"
          onClick={() => setPanelOpen(side, false)}
        />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      <ResizeHandle side={side} title={title} width={width} />
    </aside>
  );
}

/** The panel's inner edge: drag it, or focus it and use the arrow keys, Home, End, or Enter to close. */
function ResizeHandle({ side, title, width }: { side: PanelSide; title: string; width: number }) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setPanelWidth(side, dragPanelWidth(side, drag.current.startWidth, event.clientX - drag.current.startX));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const action = separatorKey(side, width, event.nativeEvent);
    if (!action) return;
    event.preventDefault();
    if ("collapse" in action) setPanelOpen(side, false);
    else setPanelWidth(side, action.width);
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={`Resize ${title.toLowerCase()}`}
      aria-valuenow={width}
      aria-valuemin={panelWidths[side].min}
      aria-valuemax={panelWidths[side].max}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onKeyDown={onKeyDown}
      className={cx(
        "group/handle absolute inset-y-3 w-3 cursor-col-resize touch-none focus-visible:outline-none",
        side === "left" ? "-right-1.5" : "-left-1.5",
      )}
    >
      <span
        aria-hidden
        className={cx(
          "absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-transparent transition-colors",
          "group-hover/handle:bg-line-strong group-focus-visible/handle:bg-accent group-active/handle:bg-accent",
        )}
      />
    </div>
  );
}
