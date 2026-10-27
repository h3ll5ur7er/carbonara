// "AI access and activity": which groups of MCP tools the person allows, how to connect a client, and every call
// MCP clients made, newest first.
import { useId } from "react";
import { useStore } from "zustand";
import { errorMessage, toast } from "../../shell/toasts";
import { Button } from "../../ui/button";
import { Dialog, DialogContent } from "../../ui/dialog";
import { Switch } from "../../ui/toggle";
import { GROUPS, type ActivityEntry, type CallStatus, type McpAccess } from "./access";
import { setMcpDialogOpen, useMcpHost } from "./host-store";
import { configSnippets, type McpConnectionInfo } from "./snippets";

export function McpAccessDialog({ access }: { access: McpAccess }) {
  const open = useMcpHost((state) => state.dialogOpen);
  return (
    <Dialog open={open} onOpenChange={setMcpDialogOpen}>
      {open && (
        <DialogContent
          title="AI access and activity"
          description="What AI assistants connected over MCP may do in Carbonara, and what they did."
          className="max-w-160"
        >
          <div className="flex flex-col gap-5">
            <Permissions access={access} />
            <Connect />
            <Activity access={access} />
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

function Permissions({ access }: { access: McpAccess }) {
  const allowed = useStore(access.store, (state) => state.allowed);
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">Allowed</h3>
      <ul className="flex flex-col gap-1">
        {GROUPS.map(({ group, title, description }) => (
          <Permission
            key={group}
            title={title}
            description={description}
            checked={allowed[group]}
            onCheckedChange={(checked) => access.allow(group, checked)}
          />
        ))}
      </ul>
    </section>
  );
}

function Permission({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange(checked: boolean): void;
}) {
  const titleId = useId();
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-1.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <span id={titleId} className="text-sm font-medium text-fg">
          {title}
        </span>
        <span className="text-xs text-fg-subtle">{description}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-labelledby={titleId} />
    </li>
  );
}

function Connect() {
  const connection = useMcpHost((state) => state.connection);
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">Connect a client</h3>
      {connection ? (
        <Snippets connection={connection} />
      ) : (
        <p className="text-sm">MCP clients such as Claude connect to the Carbonara desktop app.</p>
      )}
    </section>
  );
}

function Snippets({ connection }: { connection: McpConnectionInfo }) {
  return (
    <ul className="flex flex-col gap-3">
      {configSnippets(connection).map(({ client, where, text }) => (
        <li key={client} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-fg">{client}</span>
            <span className="flex-1 text-xs text-fg-subtle">{where}</span>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Copy the ${client} config`}
              onClick={() => copy(client, text)}
            >
              Copy
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-md bg-surface-1 px-3 py-2 font-mono text-2xs text-fg">{text}</pre>
        </li>
      ))}
    </ul>
  );
}

function copy(client: string, text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() =>
      toast({
        title: `${client} config copied`,
        description: "It holds your token: keep it private.",
        tone: "success",
      }),
    )
    .catch((error: unknown) => toast({ title: "Couldn't copy", description: errorMessage(error), tone: "error" }));
}

const STATUS: Record<CallStatus, { label: string; tone: string }> = {
  running: { label: "Running", tone: "text-fg-muted" },
  done: { label: "Done", tone: "text-success" },
  failed: { label: "Failed", tone: "text-danger" },
  refused: { label: "Refused", tone: "text-danger" },
};

function Activity({ access }: { access: McpAccess }) {
  const activity = useStore(access.store, (state) => state.activity);
  const headingId = useId();
  return (
    <section className="flex flex-col gap-2">
      <h3 id={headingId} className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">
        Activity
      </h3>
      {activity.length === 0 ? (
        <p className="text-sm">No calls yet.</p>
      ) : (
        <ul aria-label="Calls" className="flex max-h-60 flex-col gap-0.5 overflow-y-auto">
          {activity.map((entry) => (
            <Call key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Call({ entry: { tool, document, at, status, message } }: { entry: ActivityEntry }) {
  const { label, tone } = STATUS[status];
  return (
    <li className="flex flex-col rounded-md px-2 py-1 hover:bg-surface-3">
      <div className="flex items-baseline gap-2 text-xs">
        <time className="font-mono text-fg-subtle tabular-nums">{new Date(at).toLocaleTimeString()}</time>
        <span className="font-mono text-fg">{tool}</span>
        {document && <span className="truncate font-mono text-fg-subtle">{document}</span>}
        <span className={`ml-auto font-medium ${tone}`}>{label}</span>
      </div>
      {message && <p className="text-xs text-fg-subtle">{message}</p>}
    </li>
  );
}
