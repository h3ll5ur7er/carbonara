// The envelope between clients (UI, MCP, CLI) and the managers in the backend.
import type { Issue } from "./issues";

export interface Request {
  id: number;
  manager: string;
  method: string;
  args: unknown;
}

/** A failure the caller can't fix by retrying: invalid arguments, an unknown method, or a bug in the backend. */
export interface RpcError {
  message: string;
  issues?: Issue[];
}

export type Response = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: RpcError };

/** Something the backend tells every client without being asked, such as a changed document. */
export interface EventMessage {
  event: string;
  payload: unknown;
}

export type BackendMessage = Response | EventMessage;
