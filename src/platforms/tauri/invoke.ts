// Hides how the desktop shell's Rust commands are reached. Tauri's `invoke` exists only on the main thread, so
// the backend worker calls them through a message port: the main thread serves the commands the worker may call,
// and the worker gets an `invoke` of the same shape through the other end.

/** Tauri's `invoke`: runs a command of the Rust shell (src/shells/tauri/src-tauri) with camelCase arguments. */
export type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

interface Call {
  id: number;
  command: string;
  args?: Record<string, unknown>;
}

type Answer = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };

/** On the main thread: answers the worker's calls of the `allowed` commands, and refuses every other command. */
export function serveInvoke(port: MessagePort, invoke: Invoke, allowed: readonly string[]): void {
  port.onmessage = async ({ data }: MessageEvent<Call>) => {
    const { id, command, args } = data;
    let answer: Answer;
    try {
      if (!allowed.includes(command)) throw new Error(`The backend may not call ${command}`);
      answer = { id, ok: true, value: await invoke(command, args) };
    } catch (error) {
      // Rust commands fail with the error they return, which arrives as a string rather than an Error.
      answer = { id, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    port.postMessage(answer);
  };
}

/** In the worker: an `invoke` that calls through the port `serveInvoke` answers on. */
export function proxyInvoke(port: MessagePort): Invoke {
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  port.onmessage = ({ data }: MessageEvent<Answer>) => {
    const call = pending.get(data.id);
    if (!call) return;
    pending.delete(data.id);
    if (data.ok) call.resolve(data.value);
    else call.reject(new Error(data.error));
  };
  return (command, args) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      port.postMessage({ id, command, ...(args && { args }) } satisfies Call);
    });
}
