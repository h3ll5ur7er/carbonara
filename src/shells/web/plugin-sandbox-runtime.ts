// What runs inside a third-party pack's plugin sandbox: the compiler engine next to the plugin, answering the
// backend's calls (plugin-sandbox-protocol.ts). Bundled on its own into plugin-sandbox.entry.ts, which the
// backend starts in an opaque-origin worker.
import type { PackData } from "../../contracts/pack";
import type { ModuleLoader } from "../../contracts/platform";
import type { Plugin } from "../../contracts/plugin";
import { compile, describePlugin, toResults, type Compiled } from "../../engines/compiler";
import type { CompileAnswer, SandboxCall, SandboxReply, SandboxRequest } from "./plugin-sandbox-protocol";

/** Answers one call at a time. Expected failures (a plugin that doesn't load) are errors in the reply. */
export function createSandboxRuntime(loadModule: ModuleLoader): (request: SandboxRequest) => Promise<SandboxReply> {
  let loaded: { plugin: Plugin; data: PackData } | undefined;
  let nextCompile = 1;
  /** Compiles waiting for their results; only the latest per document. */
  const compiles = new Map<number, Compiled>();
  const latest = new Map<string, number>();

  async function answer(call: SandboxCall): Promise<unknown> {
    if (call.call === "load") {
      loaded = { plugin: await loadPlugin(loadModule, call.source), data: call.data };
      return { pluginId: loaded.plugin.id };
    }
    if (!loaded) throw new Error("No plugin is loaded");
    const { plugin, data } = loaded;
    switch (call.call) {
      case "compile": {
        const compiled = compile({ document: call.document, pack: data, plugin });
        const compileId = nextCompile++;
        const before = latest.get(compiled.documentId);
        if (before !== undefined) compiles.delete(before);
        latest.set(compiled.documentId, compileId);
        compiles.set(compileId, compiled);
        return { compileId, model: compiled.model } satisfies CompileAnswer;
      }
      case "results": {
        const compiled = compiles.get(call.compileId);
        if (!compiled) throw new Error("That compile is no longer kept");
        compiles.delete(call.compileId);
        return toResults(compiled, call.outcome, plugin, call.version);
      }
      case "describe":
        return describePlugin(data, plugin, call.settings);
    }
  }

  return async ({ id, ...call }) => {
    try {
      return { id, ok: true, value: await answer(call as SandboxCall) };
    } catch (error) {
      return { id, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };
}

async function loadPlugin(loadModule: ModuleLoader, source: string): Promise<Plugin> {
  let module: Record<string, unknown>;
  try {
    module = await loadModule(source);
  } catch (error) {
    throw new Error(`The plugin doesn't load: ${String(error)}`, { cause: error });
  }
  const plugin = module.default as Partial<Plugin> | undefined;
  if (typeof plugin !== "object" || plugin === null || typeof plugin.id !== "string") {
    throw new Error("The plugin doesn't export a plugin; write export default definePlugin({ id: … })");
  }
  return plugin as Plugin;
}
