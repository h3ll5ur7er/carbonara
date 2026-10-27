// Runs registered commands from the keyboard, anywhere in the app.
import { useEffect } from "react";
import type { CommandRegistry } from "./commands";
import { isEditableTarget, type Platform } from "./commands-shortcuts";

export function useCommandShortcuts(registry: CommandRegistry, platform: Platform): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const command = registry.forKey(event, platform, isEditableTarget(target));
      if (!command) return;
      event.preventDefault();
      command.run();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [registry, platform]);
}
