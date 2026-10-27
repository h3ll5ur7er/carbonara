// "New factory": a name and a game pack, then an empty document opens in a new tab.
import { useState, type FormEvent } from "react";
import { useConnector } from "../../core/connector";
import { useModels } from "../../core/models";
import { errorMessage, toast } from "../../shell/toasts";
import { Button } from "../../ui/button";
import { Dialog, DialogContent } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Select } from "../../ui/select";
import { usePacks } from "../packs/use-packs";
import { setNewDocumentDialogOpen, useNewDocumentDialog } from "./new-document-store";

const FORM = "new-document";

export function NewDocumentDialog() {
  const open = useNewDocumentDialog((state) => state.open);
  return (
    <Dialog open={open} onOpenChange={setNewDocumentDialogOpen}>
      {open && <NewDocumentForm />}
    </Dialog>
  );
}

function NewDocumentForm() {
  const connector = useConnector();
  const { workspace } = useModels();
  const packs = usePacks();
  const [name, setName] = useState("Untitled factory");
  const [chosen, setChosen] = useState<string>();
  const [busy, setBusy] = useState(false);
  const packId = chosen ?? packs?.[0]?.manifest.id ?? "";

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!packId) return;
    setBusy(true);
    try {
      const document = await connector.workspace.createDocument({ name: name.trim() || "Untitled factory", packId });
      workspace.activate(document.id);
      setNewDocumentDialogOpen(false);
    } catch (error) {
      toast({ title: "Couldn't create the factory", description: errorMessage(error), tone: "error" });
      setBusy(false);
    }
  }

  return (
    <DialogContent
      title="New factory"
      description="An empty canvas for one game. You can open as many factories as you like, each in its own tab."
      footer={
        <>
          <Button variant="ghost" onClick={() => setNewDocumentDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={FORM} disabled={!packId || busy}>
            Create
          </Button>
        </>
      }
    >
      <form id={FORM} onSubmit={create} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-subtle">Name</span>
          <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </label>
        <div className="flex flex-col gap-1.5">
          <span id="new-document-pack" className="text-xs font-medium text-fg-subtle">
            Game
          </span>
          {packs && packs.length > 0 ? (
            <Select
              aria-labelledby="new-document-pack"
              value={packId}
              onValueChange={setChosen}
              options={packs.map(({ manifest }) => ({ value: manifest.id, label: manifest.name }))}
            />
          ) : (
            <p className="text-sm text-fg-subtle">{packs ? "No game packs are installed." : "Loading game packs…"}</p>
          )}
        </div>
      </form>
    </DialogContent>
  );
}
