// What MCP clients may do and what they did: the permission groups the person switched on, and the activity log
// the bridge writes. It lives in memory, so every start of the app is read-only again until the person allows
// more (no preferences store persists settings yet).
import { createStore, type StoreApi } from "zustand/vanilla";
import type { McpGroup } from "../../../contracts/managers";

export const GROUPS: { group: McpGroup; title: string; description: string }[] = [
  { group: "read", title: "Read", description: "Look at open factories, their results and the game packs." },
  { group: "plan", title: "Plan", description: "Plan production lines as proposals you accept or discard." },
  { group: "edit", title: "Edit", description: "Change factories. Every change is one step you can undo." },
  { group: "authoring", title: "Pack authoring", description: "Create and change packs in development folders." },
];

export type CallStatus = "running" | "done" | "failed" | "refused";

export interface ActivityEntry {
  id: number;
  tool: string;
  group: McpGroup;
  /** The document the call named, if any. */
  document?: string;
  /** When the call came in (ms since the epoch). */
  at: number;
  status: CallStatus;
  /** Why it failed or was refused. */
  message?: string;
  durationMs?: number;
}

export interface McpAccessState {
  allowed: Record<McpGroup, boolean>;
  /** Newest first. */
  activity: ActivityEntry[];
}

/** Older calls drop off the log. */
export const ACTIVITY_LIMIT = 200;

export interface McpAccess {
  store: StoreApi<McpAccessState>;
  allowed(group: McpGroup): boolean;
  allow(group: McpGroup, allowed: boolean): void;
  /** Logs a call that came in; returns its id for `end`. */
  begin(call: { tool: string; group: McpGroup; document?: string }): number;
  end(id: number, status: Exclude<CallStatus, "running">, message?: string): void;
}

export function createMcpAccess(now: () => number = Date.now): McpAccess {
  const store = createStore<McpAccessState>(() => ({
    allowed: { read: true, plan: false, edit: false, authoring: false },
    activity: [],
  }));
  let nextId = 1;
  return {
    store,
    allowed: (group) => store.getState().allowed[group],
    allow: (group, allowed) => store.setState(({ allowed: before }) => ({ allowed: { ...before, [group]: allowed } })),
    begin(call) {
      const id = nextId++;
      const entry: ActivityEntry = { id, ...call, at: now(), status: "running" };
      store.setState(({ activity }) => ({ activity: [entry, ...activity].slice(0, ACTIVITY_LIMIT) }));
      return id;
    },
    end(id, status, message) {
      store.setState(({ activity }) => ({
        activity: activity.map((entry) =>
          entry.id === id ? { ...entry, status, ...(message && { message }), durationMs: now() - entry.at } : entry,
        ),
      }));
    },
  };
}
