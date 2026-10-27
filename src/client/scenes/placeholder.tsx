// Stand-ins for canonical scenes whose features don't exist yet: the shell with a note on the canvas saying
// which scene belongs here and which task builds it. Replace the registry entry when the real scene exists.
import { Construction } from "lucide-react";
import type { ComponentType } from "react";
import { AppShell } from "../app";
import { Canvas } from "../canvas/canvas";
import { ConnectorProvider } from "../core/connector";
import { fakeConnector } from "./fake-backend";

export function placeholderScene(title: string, task: string): ComponentType {
  const connector = fakeConnector({});
  return function PlaceholderScene() {
    return (
      <ConnectorProvider connector={connector}>
        <AppShell canvas={<PlaceholderCanvas title={title} task={task} />} />
      </ConnectorProvider>
    );
  };
}

function PlaceholderCanvas({ title, task }: { title: string; task: string }) {
  return (
    <div className="canvas-backdrop absolute inset-0">
      <Canvas />
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-canvas-glow px-10 py-8 text-center">
          <span className="grid size-10 place-items-center rounded-xl bg-surface-3 text-fg-subtle inset-ring inset-ring-line-subtle">
            <Construction className="size-4.5" aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-fg-muted">Placeholder scene: {title}</p>
            <p className="text-xs text-fg-subtle">Replaced by the real scene from {task}.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
