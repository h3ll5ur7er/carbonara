// "Steel, 2 full yellow belts" (docs/Architecture/MCP-server.md, Example) as a scripted MCP session, end to end
// on the TypeScript side: the scripted client sends each call exactly as the Rust server does (tool, plus the
// manager method from the manifest), through the webview's bridge, its permissions and the connector, to the real
// workspace, editing and analysis managers, the Factorio pack and the solver. The Rust side of the trip is tested
// in crates/mcp.
//
// Stand-ins until the real pieces are merged, each marked SWITCH below:
// - the client converts "2 full yellow belts" itself, from the pack's logistics, until convert_rate exists
//   (planning manager);
// - `fakePlanning` stands in for the planning manager's plan_production (CARB-45);
// - accepting runs the proposal's commands through edit_graph until apply_proposal exists (CARB-46).
import { readdirSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import factorioPlugin from "../packs/factorio/plugin/index";
import { createMcpAccess } from "../src/client/features/mcp/access";
import { startMcpBridge } from "../src/client/features/mcp/bridge";
import type { DocumentStore, LoadedPack, OpenDocument, PackStore } from "../src/contracts/access";
import { Command, type CommandInput } from "../src/contracts/commands";
import { managers, type DocumentInfo, type Events, type MethodContract } from "../src/contracts/managers";
import type { PackData } from "../src/contracts/pack";
import type { Request, Response } from "../src/contracts/rpc";
import { readPackFiles } from "../src/engines/packs/files";
import { loadSolver } from "../src/engines/solver";
import { createAnalysisManager } from "../src/managers/analysis";
import { createEditingManager } from "../src/managers/editing";
import { createWorkspaceManager } from "../src/managers/workspace";
import { createEventBus } from "../src/utilities/events";
import { connect, createDispatcher, type Transport } from "../src/utilities/rpc";
import { buildManifest } from "./mcp-tools";

// SWITCH: the planning manager's contract (CARB-45) replaces this one; its tool comes through the generator as is.
const Proposal = z.object({
  summary: z.object({ buildings: z.record(z.string(), z.number()), raw: z.record(z.string(), z.number()) }),
  commands: z.array(Command),
});
type Proposal = z.infer<typeof Proposal>;

const contracts = {
  ...managers,
  planning: {
    planProduction: {
      args: z.object({ documentId: z.string().min(1), targets: z.record(z.string(), z.number().positive()) }),
      mcp: {
        tool: "plan_production",
        group: "plan",
        description: "Plan a production line for target rates (items per second) as a proposal.",
      },
    } satisfies MethodContract<z.ZodType, Proposal>,
  },
};

/**
 * SWITCH: the real planner. This one knows one line, steel from iron ore in steel furnaces (speed 2): a steel
 * plate takes 5 iron plates and 16 s, an iron plate 1 iron ore and 3.2 s.
 */
const fakePlanning = {
  async planProduction({ targets }: { documentId: string; targets: Record<string, number> }): Promise<Proposal> {
    const steel = targets["steel-plate"] ?? 0;
    const iron = 5 * steel;
    const furnaces = steel / (2 / 16) + iron / (2 / 3.2);
    const at = (x: number) => ({ x, y: 0 });
    const furnace = (recipe: string) => ({ kind: "recipe" as const, recipe, building: "steel-furnace" });
    const commands: CommandInput[] = [
      { type: "addNode", id: "ore", node: { kind: "source", item: "iron-ore" }, position: at(0) },
      { type: "addNode", id: "iron", node: furnace("iron-plate"), position: at(320) },
      { type: "addNode", id: "steel", node: furnace("steel-plate"), position: at(640) },
      {
        type: "addNode",
        id: "out",
        node: { kind: "sink", item: "steel-plate", targetPerSecond: steel },
        position: at(960),
      },
      { type: "connect", edge: { from: "ore", to: "iron", item: "iron-ore" } },
      { type: "connect", edge: { from: "iron", to: "steel", item: "iron-plate" } },
      { type: "connect", edge: { from: "steel", to: "out", item: "steel-plate" } },
    ];
    return Proposal.parse({
      summary: { buildings: { "steel-furnace": furnaces }, raw: { "iron-ore": iron } },
      commands,
    });
  },
};

/** The documents open in this session, in memory. */
function memoryDocuments(): DocumentStore {
  const open = new Map<string, OpenDocument>();
  return {
    list: () =>
      [...open.values()].map(({ document, version }) => ({
        id: document.id,
        name: document.name,
        packId: document.pack.id,
        version,
      })),
    get: (documentId) => open.get(documentId),
    put(document) {
      const stored = { document, version: (open.get(document.id)?.version ?? 0) + 1 };
      open.set(document.id, stored);
      return stored;
    },
    remove: (documentId) => void open.delete(documentId),
  };
}

/** The Factorio pack as the packs engine reads its folder. */
function factorioPack(): LoadedPack {
  const folder = new URL("../packs/factorio/", import.meta.url);
  const files: Record<string, Uint8Array> = {
    "manifest.yaml": readFileSync(new URL("manifest.yaml", folder)),
    "plugin/index.js": new Uint8Array(),
  };
  for (const name of readdirSync(new URL("data/", folder))) {
    files[`data/${name}`] = readFileSync(new URL(`data/${name}`, folder));
  }
  const pack = readPackFiles(files);
  if (!pack.ok) throw new Error(pack.error.map(({ message }) => message).join("\n"));
  return {
    info: { manifest: pack.value.manifest, hash: "sha256-factorio", builtIn: true },
    data: pack.value.data,
    plugin: factorioPlugin,
  };
}

const factorio = factorioPack();
const packs: PackStore = { list: async () => [factorio.info], get: async () => factorio };

/** Carbonara with the MCP bridge attached, and a scripted MCP client that talks to it like the Rust server. */
function carbonara() {
  const bus = createEventBus<Events>();
  const documents = memoryDocuments();
  let nextId = 1;
  const newId = () => `id-${nextId++}`;
  const dispatch = createDispatcher(contracts, {
    workspace: createWorkspaceManager({ documents, packs, events: bus, newId }),
    editing: createEditingManager({ documents, events: bus, newId }),
    analysis: createAnalysisManager({ bus, documents, packs }),
    packs: { listPacks: async () => [factorio.info], getPackData: async () => factorio.data },
    planning: fakePlanning,
  });
  const backendListeners: ((message: unknown) => void)[] = [];
  const backend = connect(contracts, {
    send: (message) =>
      void dispatch(message as Request).then((response) => backendListeners.forEach((listener) => listener(response))),
    listen: (listener) => backendListeners.push(listener),
  });

  // The webview's end of the bridge, with the tab on screen and the person's switches.
  const access = createMcpAccess();
  let activeTab: string | null = null;
  let toBridge: (message: unknown) => void = () => undefined;
  const answers = new Map<number, (response: Response) => void>();
  const shell: Transport = {
    send: (message) => answers.get((message as Response).id)?.(message as Response),
    listen: (listener) => (toBridge = listener),
  };
  startMcpBridge({ transport: shell, contracts, backend, activeDocumentId: () => activeTab, access });

  // The scripted MCP client, seen through the server: the manifest maps each tool to its manager method, and
  // answers travel as JSON text.
  const manifest = buildManifest(contracts);
  let nextCall = 1;
  const client = {
    tools: manifest.tools.map(({ name }) => name),
    call: async <T = unknown>(
      tool: string,
      args: object = {},
    ): Promise<{ ok: true; value: T } | { ok: false; error: string }> => {
      const entry = manifest.tools.find(({ name }) => name === tool);
      if (!entry) throw new Error(`The server has no tool ${tool}`);
      const id = nextCall++;
      const response = await new Promise<Response>((resolve) => {
        answers.set(id, resolve);
        toBridge({ id, tool, manager: entry.manager, method: entry.method, args });
      });
      return response.ok
        ? { ok: true, value: JSON.parse(JSON.stringify(response.value)) as T }
        : { ok: false, error: response.error.message };
    },
  };

  const history: string[] = [];
  bus.subscribe("documentChanged", ({ label }) => label && history.push(label));
  return {
    client,
    access,
    history,
    /** The person opens a new Factorio factory in a tab. */
    async openFactory(name: string) {
      const info = await backend.workspace.createDocument({ name, packId: "factorio" });
      activeTab = info.id;
      return info;
    },
  };
}

function expectOk<T>(answer: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!answer.ok) throw new Error(`Expected a value, got: ${answer.error}`);
  return answer.value;
}

beforeAll(async () => {
  await loadSolver(readFileSync(new URL("../src/engines/solver/wasm/solver_bg.wasm", import.meta.url)));
});

describe("Steel, 2 full yellow belts, through MCP", () => {
  it("plans a proposal, and accepting it yields a deficit-free factory that matches it", async () => {
    const { client, access, history, openFactory } = carbonara();
    expect(client.tools).toContain("plan_production");
    const factory = await openFactory("Steel");

    // The client finds the document on screen and its pack.
    const [listed] = expectOk(await client.call<DocumentInfo[]>("list_documents"));
    expect(listed).toMatchObject({ id: factory.id, packId: "factorio" });
    const pack = expectOk(await client.call<PackData>("get_pack_data", { packId: listed?.packId }));

    // SWITCH: convert_rate("2 full yellow belts"), once the planning manager has it.
    const belt = pack.logistics.find(({ aliases }) => aliases?.includes("yellow belt"));
    expect(belt).toMatchObject({ id: "transport-belt", capacity: 15 });
    expect(pack.units.rate).toBe("per_second");
    const target = 2 * (belt?.capacity ?? 0);
    expect(target).toBe(30);

    // Planning is off until the person allows it.
    const targets = { documentId: "active", targets: { "steel-plate": target } };
    expect(await client.call("plan_production", targets)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Plan tools are switched off/),
    });
    access.allow("plan", true);
    const proposal = expectOk(await client.call<Proposal>("plan_production", targets));
    // The wiki's numbers: 480 steel furnaces and 9000 iron ore per minute.
    expect(proposal.summary).toEqual({ buildings: { "steel-furnace": 480 }, raw: { "iron-ore": 150 } });

    // The person accepts. SWITCH: apply_proposal once it exists.
    access.allow("edit", true);
    const accepted = await client.call("edit_graph", {
      documentId: "active",
      commands: proposal.commands,
      label: "Accept the steel proposal",
    });
    expect(accepted).toMatchObject({ ok: true, value: { ok: true, value: { id: factory.id } } });
    expect(history).toEqual(["AI: Accept the steel proposal"]);

    // The solved factory runs without deficits and matches the proposal's summary.
    const { diagnostics } = expectOk(
      await client.call<{ diagnostics: { kind: string }[] }>("get_diagnostics", { documentId: "active" }),
    );
    expect(diagnostics).toEqual([]);
    const { totals } = expectOk(
      await client.call<{ totals: { buildings: Record<string, number>; raw: Record<string, number> } }>("get_totals", {
        documentId: "active",
      }),
    );
    expect(totals.buildings).toEqual(proposal.summary.buildings);
    for (const [item, perSecond] of Object.entries(proposal.summary.raw)) {
      expect(totals.raw[item], item).toBeCloseTo(perSecond, 9);
    }

    // One step undoes the whole line.
    expectOk(await client.call("undo", { documentId: "active" }));
    const graph = expectOk(await client.call<{ nodes: object }>("get_graph", { documentId: "active" }));
    expect(graph.nodes).toEqual({});
    expect(history.at(-1)).toBe("Undo AI: Accept the steel proposal");

    // Every call is in the activity log, the refusal included.
    const log = access.store.getState().activity.map(({ tool, status }) => `${tool} ${status}`);
    expect(log.reverse()).toEqual([
      "list_documents done",
      "get_pack_data done",
      "plan_production refused",
      "plan_production done",
      "edit_graph done",
      "get_diagnostics done",
      "get_totals done",
      "undo done",
      "get_graph done",
    ]);
  });
});
