// The library cards' edits for the document on screen: rename, duplicate and delete blueprints, each one step
// through the editing manager, with a toast when it's refused.
import { useMemo } from "react";
import type { CommandInput } from "../../../contracts/commands";
import type { Document } from "../../../contracts/document";
import { useConnector } from "../../core/connector";
import { errorMessage, toast } from "../../shell/toasts";
import type { BlueprintManagement } from "./library-panel";
import { deleteEdit, duplicateEdit, type BlueprintEdit } from "./library";

export function useBlueprintManagement(document: Document | undefined): BlueprintManagement | undefined {
  const connector = useConnector();
  return useMemo(() => {
    if (!document) return undefined;
    const apply = (edit: BlueprintEdit | undefined) => {
      if (!edit) return;
      const failed = (description: string) =>
        toast({ tone: "error", title: `Couldn't ${edit.label.toLowerCase()}`, ...(description && { description }) });
      connector.editing.apply({ documentId: document.id, commands: edit.commands, label: edit.label }).then(
        (result) => {
          if (!result.ok) failed(result.error.map((issue) => issue.message).join(" "));
        },
        (error: unknown) => failed(errorMessage(error)),
      );
    };
    const rename = (blueprint: string, name: string): BlueprintEdit => ({
      commands: [{ type: "renameBlueprint", blueprint, name } satisfies CommandInput],
      label: `Rename blueprint to ${name}`,
    });
    return {
      rename: (blueprint, name) => apply(rename(blueprint, name)),
      duplicate: (blueprint) => apply(duplicateEdit(document, blueprint)),
      remove: (blueprints) => apply(deleteEdit(document, blueprints)),
    };
  }, [connector, document]);
}
