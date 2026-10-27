// The plugin sandbox's protocol, with the sandbox runtime in this process instead of an opaque-origin worker
// (e2e/plugins-sandbox.spec.ts covers the worker and its isolation in a browser).
import { build } from "esbuild";
import { describe, expect, it, vi } from "vitest";
import type { Document } from "../../contracts/document";
import { ok } from "../../contracts/result";
import type { Solution } from "../../contracts/solver";
import { localRuntime } from "../../engines/compiler";
import { fixturePlugin, smeltingWith } from "../../engines/compiler/hooks.fixture";
import { platesModule, templatePack } from "../../engines/compiler/template.fixture";
import { loadModule } from "../../platforms/node/module-loader";
import type { SandboxReply, SandboxRequest } from "./plugin-sandbox-protocol";
import { isolatePlugin, type SandboxPort } from "./plugin-sandbox";
import { createSandboxRuntime } from "./plugin-sandbox-runtime";

const pack = templatePack();

/** The fixture plugin as a third-party pack ships it: one bundled ES module. */
async function fixtureSource(): Promise<string> {
  const bundle = await build({
    stdin: {
      contents: 'export { fixturePlugin as default } from "./hooks.fixture";',
      resolveDir: "src/engines/compiler",
    },
    bundle: true,
    format: "esm",
    write: false,
    // The fixture module also builds test documents from files; the plugin itself doesn't need them.
    plugins: [
      {
        name: "no-documents",
        setup(esbuild) {
          esbuild.onResolve({ filter: /template\.fixture$/ }, () => ({ path: "documents", namespace: "stub" }));
          esbuild.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const waterLoop = null;" }));
        },
      },
    ],
  });
  return bundle.outputFiles[0]?.text ?? "";
}

/** A sandbox in this process; messages are cloned as they would be between workers. */
function inProcess(answer = createSandboxRuntime(loadModule)): SandboxPort & { stopped: boolean } {
  const listeners: ((event: { data: unknown }) => void)[] = [];
  const port = {
    stopped: false,
    postMessage(message: SandboxRequest) {
      void answer(structuredClone(message)).then((reply) => {
        if (!port.stopped) listeners.forEach((listener) => listener({ data: structuredClone(reply) }));
      });
    },
    addEventListener: (_type: "message", listener: (event: { data: unknown }) => void) => void listeners.push(listener),
    terminate: () => void (port.stopped = true),
  };
  return port;
}

const solutionFor = (nodes: number, edges: number): Solution => ({
  activity: Array.from({ length: nodes }, (_, index) => index + 1),
  flow: Array.from({ length: edges }, () => 0.5),
  surplus: [],
  deficit: [],
  overflow: [],
  pinMisses: [],
});

describe("a plugin in its sandbox", () => {
  it("compiles, maps results back and describes itself exactly as the in-worker path does", async () => {
    const isolated = await isolatePlugin({ start: () => inProcess() }, { source: await fixtureSource(), data: pack });
    if (!isolated.ok) throw new Error(JSON.stringify(isolated.error));
    const here = localRuntime(pack, fixturePlugin);
    const documents: Document[] = [
      smeltingWith({}),
      smeltingWith({ fields: { speed: 150, mode: "eager", boosted: true } }, { boosters: 1 }),
      smeltingWith({ recipe: "iron-plate-from-ore", fields: { speed: 900 } }, { unlocked: [] }),
    ];
    for (const document of documents) {
      const [there, local] = [await isolated.value.compile(document), await here.compile(document)];
      expect(there.model).toEqual(local.model);
      expect(there.items).toEqual(local.items);
      const solution = ok(solutionFor(local.model.nodes.length, local.model.edges.length));
      expect(await there.results(solution, 4)).toEqual(await local.results(solution, 4));
    }
    expect(await isolated.value.describe({ boosters: 2 })).toEqual(await here.describe({ boosters: 2 }));
    for (const settings of [{}, { unlocked: [] }]) {
      expect(await isolated.value.unavailableRecipes(settings)).toEqual(await here.unavailableRecipes(settings));
    }
    expect(await here.unavailableRecipes({ unlocked: [] })).toContain("iron-plate-from-ore");
  });

  it("expands blueprints exactly as the in-worker path does, after the document's results too", async () => {
    const isolated = await isolatePlugin({ start: () => inProcess() }, { source: await fixtureSource(), data: pack });
    if (!isolated.ok) throw new Error(JSON.stringify(isolated.error));
    const here = localRuntime(pack, fixturePlugin);
    const [there, local] = [await isolated.value.compile(platesModule()), await here.compile(platesModule())];
    expect(there.blueprints).toEqual({ plates: 0 });
    expect(there.blueprints).toEqual(local.blueprints);
    const root = ok(solutionFor(local.model.nodes.length, local.model.edges.length));
    expect(await there.results(root, 2)).toEqual(await local.results(root, 2));
    const inside = local.model.blueprints?.[0];
    const expanded = ok(solutionFor(inside?.nodes.length ?? 0, inside?.edges.length ?? 0));
    const results = await there.blueprintResults("plates", expanded, 2);
    expect(results).toEqual(await local.blueprintResults("plates", expanded, 2));
    expect(results.graph).toBe("plates");
  });

  it("keeps only blueprint indices the model has", async () => {
    const honest = createSandboxRuntime(loadModule);
    const lying = async (request: SandboxRequest): Promise<SandboxReply> => {
      const reply = await honest(request);
      if (request.call !== "compile" || !reply.ok) return reply;
      return { ...reply, value: { ...(reply.value as object), blueprints: { plates: 7, other: -1, x: "0" } } };
    };
    const isolated = await isolatePlugin(
      { start: () => inProcess(lying) },
      { source: "export default { id: 'liar' };", data: pack },
    );
    if (!isolated.ok) throw new Error("not loaded");
    expect((await isolated.value.compile(platesModule())).blueprints).toEqual({});
  });

  it("refuses a plugin that doesn't load, or doesn't export a plugin", async () => {
    const start = () => inProcess();
    expect(await isolatePlugin({ start }, { source: "export default {", data: pack })).toMatchObject({
      ok: false,
      error: [{ path: ["plugin/index.js"], message: expect.stringContaining("The plugin doesn't load") }],
    });
    expect(await isolatePlugin({ start }, { source: "export default 42;", data: pack })).toMatchObject({
      ok: false,
      error: [{ message: "The plugin doesn't export a plugin; write export default definePlugin({ id: … })" }],
    });
  });

  it("pins results to the document and version they were asked for", async () => {
    const honest = createSandboxRuntime(loadModule);
    const lying = async (request: SandboxRequest): Promise<SandboxReply> => {
      const reply = await honest(request);
      if (request.call !== "results" || !reply.ok) return reply;
      return { ...reply, value: { ...(reply.value as object), documentId: "someone-else", version: 99 } };
    };
    const isolated = await isolatePlugin(
      { start: () => inProcess(lying) },
      { source: "export default { id: 'liar' };", data: pack },
    );
    if (!isolated.ok) throw new Error("not loaded");
    const compiled = await isolated.value.compile(smeltingWith({}));
    const results = await compiled.results(
      ok(solutionFor(compiled.model.nodes.length, compiled.model.edges.length)),
      3,
    );
    expect([results.documentId, results.version]).toEqual(["doc-water", 3]);
  });

  it("stops a sandbox that doesn't answer in time, and starts a fresh one for the next call", async () => {
    vi.useFakeTimers();
    try {
      const sandboxes: (SandboxPort & { stopped: boolean })[] = [];
      const runtime = createSandboxRuntime(loadModule);
      const stuckOnce = (request: SandboxRequest) =>
        sandboxes.length === 1 && request.call === "compile" ? new Promise<SandboxReply>(() => {}) : runtime(request);
      const start = () => {
        const sandbox = inProcess(stuckOnce);
        sandboxes.push(sandbox);
        return sandbox;
      };
      const isolated = await isolatePlugin(
        { start, timeoutMs: 1000 },
        { source: "export default { id: 'slow' };", data: pack },
      );
      if (!isolated.ok) throw new Error("not loaded");
      const stuck = isolated.value.compile(smeltingWith({}));
      const failed = expect(stuck).rejects.toThrow("The pack's plugin didn't answer in time");
      await vi.advanceTimersByTimeAsync(1000);
      await failed;
      expect(sandboxes[0]?.stopped).toBe(true);
      const again = await isolated.value.compile(smeltingWith({}));
      expect(again.model.nodes.length).toBeGreaterThan(0);
      expect(sandboxes).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
