// The backend's side of a third-party pack's plugin sandbox: a `PluginRuntime` whose compile step runs in the
// sandbox (one round trip per compile, one for the results), with a time limit on every call. Hides the message
// protocol and that the sandbox may have to be restarted. Answers are untrusted: results are pinned to the document
// and version they were asked for, so a plugin can't speak for other documents.
import type { PluginRuntime } from "../../contracts/access";
import type { PackData } from "../../contracts/pack";
import type { PluginDescription } from "../../contracts/plugin";
import { fail, ok, type Result } from "../../contracts/result";
import type { AnalysisResults } from "../../contracts/results";
import type { CompileAnswer, SandboxCall, SandboxReply, SandboxRequest } from "./plugin-sandbox-protocol";

/** One running sandbox, as a worker presents it. */
export interface SandboxPort {
  postMessage(message: SandboxRequest): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  terminate(): void;
}

export interface SandboxOptions {
  /** Starts a fresh sandbox (an opaque-origin worker on the web). */
  start(): SandboxPort;
  /** How long a call may take before the sandbox is stopped. */
  timeoutMs?: number;
}

/** Loads a plugin into a sandbox of its own. Fails, as the pack library does, when the plugin doesn't load. */
export async function isolatePlugin(
  { start, timeoutMs = 10_000 }: SandboxOptions,
  plugin: { source: string; data: PackData },
): Promise<Result<PluginRuntime>> {
  let running: Promise<Connection> | undefined;

  /** The sandbox with the plugin loaded; started again after it was stopped. */
  function started(): Promise<Connection> {
    if (!running) {
      const connection = connect(start(), timeoutMs, () => (running = undefined));
      running = connection.call({ call: "load", ...plugin }).then(() => connection);
      running.catch(() => connection.stop());
    }
    return running;
  }

  try {
    await started();
  } catch (error) {
    return fail([{ path: ["plugin/index.js"], message: error instanceof Error ? error.message : String(error) }]);
  }

  return ok({
    async compile(document) {
      const sandbox = await started();
      const answer = (await sandbox.call({ call: "compile", document })) as CompileAnswer;
      if (typeof answer?.compileId !== "number" || typeof answer.model !== "object") {
        throw new Error("The pack's plugin sandbox answered nonsense");
      }
      return {
        model: answer.model,
        async results(outcome, version) {
          const results = (await sandbox.call({
            call: "results",
            compileId: answer.compileId,
            outcome,
            version,
          })) as AnalysisResults;
          return { ...results, documentId: document.id, version, graph: "root" };
        },
        // Blueprints' insides aren't expanded for sandboxed packs yet (CARB-39): their instances still solve.
        blueprints: {},
        blueprintResults: async (graph) => {
          throw new Error(`Blueprint ${graph} can't be expanded in the plugin sandbox yet`);
        },
      };
    },
    async describe(settings) {
      return (await (await started()).call({ call: "describe", settings })) as PluginDescription;
    },
    dispose() {
      void running?.then((connection) => connection.stop());
      running = undefined;
    },
  });
}

interface Connection {
  call(call: SandboxCall): Promise<unknown>;
  stop(): void;
}

function connect(port: SandboxPort, timeoutMs: number, stopped: () => void): Connection {
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  let nextId = 1;
  let alive = true;

  function stop(reason = "The pack's plugin sandbox was stopped") {
    if (!alive) return;
    alive = false;
    port.terminate();
    stopped();
    for (const { reject } of pending.values()) reject(new Error(reason));
    pending.clear();
  }

  port.addEventListener("message", ({ data }) => {
    if (!isReply(data)) return;
    const waiting = pending.get(data.id);
    if (!waiting) return;
    pending.delete(data.id);
    if (data.ok) waiting.resolve(data.value);
    else waiting.reject(new Error(String(data.error)));
  });

  return {
    call(call) {
      if (!alive) return Promise.reject(new Error("The pack's plugin sandbox was stopped"));
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => stop("The pack's plugin didn't answer in time"), timeoutMs);
        const settle =
          <T>(then: (value: T) => void) =>
          (value: T) => {
            clearTimeout(timer);
            then(value);
          };
        pending.set(id, { resolve: settle(resolve), reject: settle(reject) });
        port.postMessage({ id, ...call });
      });
    },
    stop: () => stop(),
  };
}

function isReply(data: unknown): data is SandboxReply {
  return typeof data === "object" && data !== null && typeof (data as SandboxReply).id === "number";
}
