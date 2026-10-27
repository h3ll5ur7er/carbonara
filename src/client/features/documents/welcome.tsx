// What the canvas shows when no factory is open: a way to start one or to open a file.
import { FilePlus, FolderOpen } from "lucide-react";
import { Button } from "../../ui/button";
import { documentActions } from "./actions";

export function Welcome() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="canvas-clearing flex max-w-md flex-col items-center gap-5 px-16 py-14 text-center">
        <div className="flex flex-col gap-1.5">
          <p className="text-xl font-semibold tracking-tight text-fg">Plan your next factory</p>
          <p className="text-sm text-fg-subtle">
            Start an empty factory for one of your games, or open a <span className="font-mono">.carbonara</span> file.
            Shared links open here too.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={documentActions.newDocument}>
            <FilePlus className="size-4" aria-hidden />
            New factory
          </Button>
          <Button onClick={documentActions.openFile}>
            <FolderOpen className="size-4" aria-hidden />
            Open file…
          </Button>
        </div>
      </div>
    </div>
  );
}
