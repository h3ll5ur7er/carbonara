// "Steel, 2 full yellow belts" (docs/Architecture/MCP-server.md, Example) as a scripted MCP session, end to end
// on the TypeScript side: the scripted client sends each call exactly as the Rust server does (tool, plus the
// manager method from the manifest), through the webview's bridge, its permissions and the connector, to the real
// workspace, editing, analysis and planning managers, the Factorio pack and the solver. The app's planner follows
// the proposals as in the live app, so the test sees what the person sees. The Rust side of the trip is tested in
// crates/mcp.
import { readdirSync, readFileSync } from "node:fs";
import ELK from "elkjs/lib/elk.bundled.js";
import { beforeAll, describe, expect, it } from "vitest";
import factorioPlugin from "../packs/factorio/plugin/index";
import { createMemoryProposalStore } from "../src/access/proposals/memory";
import { createMcpAccess } from "../src/client/features/mcp/access";
import { followProposals, usePlanner } from "../src/client/features/planner/planner-store";
import { startMcpBridge } from "../src/client/features/mcp/bridge";
import type { DocumentStore, LoadedPack, OpenDocument, PackStore } from "../src/contracts/access";
import {
  managers as contracts,
  type DocumentInfo,
  type Events,
  type Proposal,
  type RateConversion,
} from "../src/contracts/managers";
import type { PackData } from "../src/contracts/pack";
import type { Result } from "../src/contracts/result";
import type { Request, Response } from "../src/contracts/rpc";
import { readPackFiles } from "../src/engines/packs/files";
import { loadSolver } from "../src/engines/solver";
import { createAnalysisManager } from "../src/managers/analysis";
import { createEditingManager } from "../src/managers/editing";
import { createPlanningManager } from "../src/managers/planning";
import { createWorkspaceManager } from "../src/managers/workspace";
import { createEventBus } from "../src/utilities/events";
import { connect, createDispatcher, type Transport } from "../src/utilities/rpc";
import { buildManifest } from "./mcp-tools";

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
  const proposals = createMemoryProposalStore();
  let nextId = 1;
  const newId = () => `id-${nextId++}`;
  const dispatch = createDispatcher(contracts, {
    workspace: createWorkspaceManager({ documents, packs, events: bus, newId }),
    editing: createEditingManager({ documents, events: bus, newId, layout: new ELK(), proposals }),
    analysis: createAnalysisManager({ bus, documents, packs }),
    packs: { listPacks: async () => [factorio.info], getPackData: async () => factorio.data },
    planning: createPlanningManager({ documents, packs, proposals, events: bus }),
  });
  const backendListeners: ((message: unknown) => void)[] = [];
  // Events reach the client as they do from the backend worker.
  bus.subscribeAll((event, payload) => backendListeners.forEach((listener) => listener({ event, payload })));
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
  // The planner card, which opens every proposal on its document's tab.
  usePlanner.setState({ open: false, documentId: null, stage: "goals", proposal: null });
  followProposals(backend, (documentId) => (activeTab = documentId));

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
    backend,
    /** The person opens a new Factorio factory in a tab. */
    async openFactory(name: string) {
      const info = await backend.workspace.createDocument({ name, packId: "factorio" });
      activeTab = info.id;
      return info;
    },
  };
}

/** Steel the classic way: from iron ore in furnaces, without Space Age's asteroid crushing and foundry casting. */
function withoutSpaceAge(pack: PackData): string[] {
  const spaceAge = new Set(["foundry", "crusher", "electromagnetic-plant", "recycler"]);
  return pack.recipes
    .filter(({ buildings }) => buildings.some((building) => spaceAge.has(building)))
    .map(({ id }) => id);
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

    // "2 full yellow belts" in items per second, with the pack's belts.
    const belts = expectOk(
      await client.call<Result<RateConversion>>("convert_rate", {
        documentId: "active",
        amount: 2,
        unit: "full yellow belts",
      }),
    );
    if (!belts.ok) throw new Error(belts.error.map(({ message }) => message).join("\n"));
    expect(belts.value).toMatchObject({ perSecond: 30, explanation: "2 × Transport belt at 15/s each" });

    // Planning is off until the person allows it. Without Space Age's recipes, which use fewer raw items.
    const targets = {
      documentId: "active",
      targets: [{ item: "steel-plate", perSecond: belts.value.perSecond }],
      options: { exclude: withoutSpaceAge(pack) },
    };
    expect(await client.call("plan_production", targets)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Plan tools are switched off/),
    });
    access.allow("plan", true);
    const planned = expectOk(await client.call<Result<Proposal>>("plan_production", targets));
    if (!planned.ok) throw new Error(planned.error.map(({ message }) => message).join("\n"));
    const proposal = planned.value;
    // 9000 iron ore per minute, in each recipe's default building: 960 stone furnaces (speed 1).
    expect(proposal.summary).toMatchObject({ buildings: { "stone-furnace": 960 }, raw: { "iron-ore": 150 } });

    // The person sees it: the planner card opens with the proposal as a ghost on the factory's tab.
    expect(usePlanner.getState()).toMatchObject({
      open: true,
      documentId: factory.id,
      stage: "proposal",
      proposal: { id: proposal.id },
    });

    // Accepting takes the Edit group: it changes the factory without the person's click.
    const accept = { proposalId: proposal.id, label: "Steel for 2 yellow belts" };
    expect(await client.call("apply_proposal", accept)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Edit tools are switched off/),
    });
    access.allow("edit", true);
    const accepted = await client.call("apply_proposal", accept);
    expect(accepted).toMatchObject({ ok: true, value: { ok: true, value: { id: factory.id } } });
    expect(history).toEqual(["AI: Steel for 2 yellow belts"]);
    // The card says it was added; accepting again adds nothing.
    expect(usePlanner.getState()).toMatchObject({ stage: "accepted", proposal: null });
    expect(await client.call("apply_proposal", accept)).toMatchObject({
      ok: true,
      value: { ok: false, error: [{ message: expect.stringMatching(/accepted already/) }] },
    });

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
    expect(history.at(-1)).toBe("Undo AI: Steel for 2 yellow belts");

    // Every call is in the activity log, the refusal included.
    const log = access.store.getState().activity.map(({ tool, status }) => `${tool} ${status}`);
    expect(log.reverse()).toEqual([
      "list_documents done",
      "get_pack_data done",
      "convert_rate done",
      "plan_production refused",
      "plan_production done",
      "apply_proposal refused",
      "apply_proposal done",
      "apply_proposal done",
      "get_diagnostics done",
      "get_totals done",
      "undo done",
      "get_graph done",
    ]);
  });

  it("tells the model when the person discarded the proposal in the app", async () => {
    const { client, access, backend, openFactory, history } = carbonara();
    await openFactory("Steel");
    access.allow("plan", true);
    access.allow("edit", true);
    const planned = expectOk(
      await client.call<Result<Proposal>>("plan_production", {
        documentId: "active",
        targets: [{ item: "steel-plate", perSecond: 1 }],
        options: { exclude: withoutSpaceAge(factorio.data) },
      }),
    );
    if (!planned.ok) throw new Error(planned.error.map(({ message }) => message).join("\n"));
    expect(usePlanner.getState().proposal?.id).toBe(planned.value.id);

    // The person clicks Discard on the planner card.
    await backend.planning.discardProposal({ proposalId: planned.value.id });
    expect(usePlanner.getState().proposal).toBeNull();
    expect(await client.call("apply_proposal", { proposalId: planned.value.id, label: "Steel" })).toMatchObject({
      ok: true,
      value: { ok: false, error: [{ message: expect.stringMatching(/The person discarded proposal/) }] },
    });
    expect(history).toEqual([]);
  });
});
