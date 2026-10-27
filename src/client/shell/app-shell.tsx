// The app shell: top bar over a full-bleed canvas, side panels floating over it, toasts at the bottom.
// The live app (live-app.tsx) and the scenes both render it, with real or fixed data.
import { Library } from "lucide-react";
import type { ReactNode } from "react";
import { Canvas } from "../canvas/canvas";
import { useCommandShortcuts } from "../core/commands-keys";
import { formatShortcut, platformOf } from "../core/commands-shortcuts";
import { CommandPalette } from "../features/command-palette/command-palette";
import { useQuickAdd } from "../features/command-palette/use-quick-add";
import { TopBar } from "../top-bar";
import { TooltipProvider } from "../ui/tooltip";
import { appRegistry } from "./app-commands";
import { InspectorPanel, type InspectorPanelProps } from "./inspector/inspector-panel";
import { SidePanel } from "./side-panel";
import { Toaster } from "./toaster";

/** The document on screen, as far as the shell needs it. */
export interface OpenDocument {
  id: string;
  name: string;
  packId: string;
}

const platform = platformOf(navigator.platform);

export interface AppShellProps {
  /** The open document; none until the workspace opens one. */
  document?: OpenDocument | null;
  /** The canvas and what sits on it; the empty canvas by default. Canvas scenes pass their own. */
  canvas?: ReactNode;
  /** What the inspector shows; nothing selected by default. */
  selection?: InspectorPanelProps["selection"];
  /** The open documents' tabs; one static tab for `document` by default. */
  tabs?: ReactNode;
}

export function AppShell({ document = null, canvas = <EmptyCanvas />, selection = null, tabs }: AppShellProps) {
  useCommandShortcuts(appRegistry, platform);
  const quickAdd = useQuickAdd(document);
  const keys = (id: string) => {
    const shortcut = appRegistry.get(id)?.shortcut;
    return shortcut ? formatShortcut(shortcut, platform) : undefined;
  };
  return (
    <TooltipProvider>
      <div className="flex h-dvh w-dvw flex-col overflow-hidden bg-canvas font-sans text-fg">
        <TopBar
          documentName={document?.name ?? "Untitled factory"}
          tabs={tabs}
          registry={appRegistry}
          platform={platform}
        />
        <main className="relative min-h-0 flex-1">
          {canvas}
          <SidePanel side="left" title="Library" shortcut={keys("view.toggleLibrary")}>
            <LibraryPlaceholder />
          </SidePanel>
          <SidePanel side="right" title="Inspector" shortcut={keys("view.toggleInspector")}>
            <InspectorPanel selection={selection} />
          </SidePanel>
        </main>
      </div>
      <CommandPalette registry={appRegistry} platform={platform} quickAdd={quickAdd} />
      <Toaster />
    </TooltipProvider>
  );
}

export function EmptyCanvas() {
  return (
    <>
      <div className="canvas-backdrop absolute inset-0">
        <Canvas />
      </div>
      <EmptyState />
    </>
  );
}

/** Over the canvas while it has nothing to show; `hint` says how to start. */
export function EmptyState({ hint = "Machines and the flows between them will appear here." }: { hint?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="canvas-clearing flex flex-col items-center gap-4 px-24 py-16 text-center">
        <GhostNode />
        <div className="flex flex-col gap-1">
          <p className="text-lg font-medium tracking-tight text-fg-muted">This factory is empty</p>
          <p className="text-sm text-fg-subtle">{hint}</p>
        </div>
      </div>
    </div>
  );
}

/** The outline of a node card with a port on each side. */
function GhostNode() {
  return (
    <svg viewBox="0 0 88 56" className="h-14 w-22 text-fg-faint" fill="none" aria-hidden>
      <rect x="8.5" y="0.5" width="71" height="55" rx="9.5" stroke="currentColor" strokeDasharray="4 3" />
      <rect x="20" y="15" width="20" height="4" rx="2" className="fill-current" />
      <rect x="20" y="25" width="36" height="3" rx="1.5" className="fill-current opacity-60" />
      <rect x="20" y="33" width="26" height="3" rx="1.5" className="fill-current opacity-60" />
      <circle cx="8.5" cy="28" r="4" className="fill-canvas" stroke="currentColor" />
      <circle cx="79.5" cy="28" r="4.5" className="fill-accent" />
    </svg>
  );
}

/** Until the pack library exists: says what the panel is for. */
function LibraryPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 pb-12 text-center">
      <span className="grid size-10 place-items-center rounded-xl bg-surface-3 text-fg-subtle inset-ring inset-ring-line-subtle">
        <Library className="size-4.5" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-fg-muted">Library</p>
        <p className="text-xs text-fg-subtle">The pack’s items and recipes will be listed here.</p>
      </div>
    </div>
  );
}
