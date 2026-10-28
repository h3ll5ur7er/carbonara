import { describe, expect, it, vi } from "vitest";
import type { OpenDocument } from "../../../contracts/access";
import { Document } from "../../../contracts/document";
import { exampleDocument } from "../../../contracts/document.fixture";
import { managers } from "../../../contracts/managers";
import type { AnalysisResults } from "../../../contracts/results";
import type { Response } from "../../../contracts/rpc";
import type { Transport } from "../../../utilities/rpc";
import { fakeConnector } from "../../scenes/fake-backend";
import { createMcpAccess, GROUPS, type McpAccess } from "./access";
import { startMcpBridge, type BridgeRequest } from "./bridge";
import { mcpTools } from "./tools";

const document = Document.parse(exampleDocument);
const results: AnalysisResults = {
  documentId: "doc-1",
  version: 2,
  graph: "root",
  nodes: {},
  edges: {},
  diagnostics: [],
  totals: { raw: { "iron-ore": 2 }, buildings: { smelter: 4 } },
};
const info = { id: "doc-1", name: "Iron", packId: "satisfactory", version: 2 };
const proposal = {
  id: "proposal-1",
  documentId: "doc-1",
  targets: [{ item: "iron-ingot", perSecond: 1 }],
  commands: [],
  results: { nodes: {}, edges: {} },
  summary: { buildings: {}, raw: {}, byproducts: {}, shortfalls: {}, powerMW: 0 },
};

/** The managers behind the bridge, recording what they were asked. */
function fakeManagers() {
  const calls: string[] = [];
  const record =
    <T>(name: string, value: T) =>
    async (args: unknown) => {
      calls.push(`${name} ${JSON.stringify(args)}`);
      return value;
    };
  const backend = fakeConnector({
    workspace: { listDocuments: record("workspace.listDocuments", [info]) },
    editing: {
      getDocument: record<OpenDocument>("editing.getDocument", { document, version: 2 }),
      apply: record("editing.apply", { ok: true as const, value: info }),
      applyProposal: record("editing.applyProposal", { ok: true as const, value: info }),
      undo: record("editing.undo", info),
    },
    analysis: { getResults: record("analysis.getResults", results) },
    planning: {
      planProduction: record("planning.planProduction", { ok: true as const, value: proposal }),
      compareRecipes: record("planning.compareRecipes", { ok: true as const, value: [] }),
      convertRate: record("planning.convertRate", {
        ok: true as const,
        value: { perSecond: 30, inDocumentUnit: { rate: 1800, unit: "per_minute" as const }, explanation: "" },
      }),
    },
    packs: {
      listPacks: record("packs.listPacks", []),
      getPackData: record("packs.getPackData", {
        units: { rate: "per_second" as const },
        items: [],
        buildings: [],
        recipes: [],
        logistics: [],
        resources: [],
        starters: [],
        categories: [],
        unlocks: [],
      }),
    },
  });
  return { backend, calls };
}

/** Every group switched on, so a test can reach any tool. */
function allowingAll(): McpAccess {
  const access = createMcpAccess(() => 0);
  for (const { group } of GROUPS) access.allow(group, true);
  return access;
}

/** Plays the desktop shell: sends tool calls to the bridge and collects its answers. */
function shell(activeDocumentId: string | null = "doc-1", access = allowingAll()) {
  const { backend, calls } = fakeManagers();
  let toBridge: (message: unknown) => void = () => undefined;
  const answers = new Map<number, (response: Response) => void>();
  const transport: Transport = {
    send: (message) => answers.get((message as Response).id)?.(message as Response),
    listen: (listener) => (toBridge = listener),
  };
  startMcpBridge({ transport, contracts: managers, backend, activeDocumentId: () => activeDocumentId, access });
  let nextId = 1;
  const call = (tool: string, args: unknown = {}) => {
    const entry = mcpTools(managers).find((candidate) => candidate.tool === tool);
    return send({ tool, manager: entry?.manager ?? "", method: entry?.method ?? "", args });
  };
  const send = (request: Omit<BridgeRequest, "id">) =>
    new Promise<Response>((resolve) => {
      const id = nextId++;
      answers.set(id, resolve);
      toBridge({ id, ...request });
    });
  return { call, send, calls };
}

describe("the MCP bridge", () => {
  it("answers a tool call with the value of its manager method", async () => {
    const { call } = shell();
    expect(await call("list_documents")).toEqual({ id: 1, ok: true, value: [info] });
  });

  it("answers with the tool's view of the value", async () => {
    const { call } = shell();
    expect(await call("get_totals", { documentId: "doc-1" })).toMatchObject({
      ok: true,
      value: { version: 2, totals: results.totals },
    });
  });

  it("reaches the manager method of every tool", async () => {
    const { call, calls } = shell();
    const args: Record<string, unknown> = {
      get_pack_data: { packId: "satisfactory" },
      edit_graph: { documentId: "doc-1", commands: [{ type: "removeNodes", ids: ["ore"] }] },
      plan_production: { documentId: "doc-1", targets: [{ item: "iron-ingot", perSecond: 1 }] },
      compare_recipes: { documentId: "doc-1", item: "iron-ingot", perSecond: 1 },
      apply_proposal: { proposalId: "proposal-1", label: "Plan iron" },
      convert_rate: { documentId: "doc-1", amount: 2, unit: "yellow belt" },
    };
    for (const { tool, manager, method } of mcpTools(managers)) {
      const response = await call(tool, args[tool] ?? { documentId: "doc-1" });
      expect(response.ok, tool).toBe(true);
      expect(calls.at(-1)).toMatch(new RegExp(`^${manager}\\.${method} `));
    }
  });

  it('reads "active" as the document on screen', async () => {
    const { call, calls } = shell("doc-1");
    await call("get_graph", { documentId: "active" });
    expect(calls).toEqual(['editing.getDocument {"documentId":"doc-1"}']);
  });

  it('says so when "active" names no document', async () => {
    const { call, calls } = shell(null);
    expect(await call("get_graph", { documentId: "active" })).toEqual({
      id: 1,
      ok: false,
      error: { message: "No document is open in Carbonara; open one or name one from list_documents." },
    });
    expect(calls).toEqual([]);
  });

  it("passes on invalid arguments with their issues", async () => {
    const { call } = shell();
    const response = await call("edit_graph", { documentId: "doc-1", commands: [] });
    expect(response).toMatchObject({
      ok: false,
      error: { message: "Invalid arguments for editing.apply", issues: [{ path: ["commands"] }] },
    });
  });

  it("refuses unknown tools and tools that no longer call the method the server named", async () => {
    const { send, calls } = shell();
    const unknown = await send({ tool: "launch_rockets", manager: "editing", method: "apply", args: {} });
    const stale = await send({ tool: "undo", manager: "editing", method: "redo", args: { documentId: "doc-1" } });
    expect(unknown).toMatchObject({ ok: false, error: { message: "Unknown tool launch_rockets" } });
    expect(stale).toMatchObject({ ok: false, error: { message: expect.stringMatching(/out of date/) } });
    expect(calls).toEqual([]);
  });

  it("turns a failing manager into an error answer", async () => {
    const failing = fakeConnector({
      workspace: {
        listDocuments: vi.fn().mockRejectedValue(new Error("Disk on fire")),
      },
    });
    const access = createMcpAccess(() => 0);
    let toBridge: (message: unknown) => void = () => undefined;
    const answer = new Promise<unknown>((resolve) => {
      startMcpBridge({
        transport: { send: resolve, listen: (listener) => (toBridge = listener) },
        contracts: managers,
        backend: failing,
        activeDocumentId: () => null,
        access,
      });
    });
    toBridge({ id: 7, tool: "list_documents", manager: "workspace", method: "listDocuments", args: {} });
    expect(await answer).toEqual({ id: 7, ok: false, error: { message: "Disk on fire" } });
    expect(access.store.getState().activity).toMatchObject([
      { tool: "list_documents", status: "failed", message: "Disk on fire" },
    ]);
  });
});

describe("the MCP bridge's permissions", () => {
  it("refuse tools of groups that are switched off, before any manager hears of them", async () => {
    const { call, calls } = shell("doc-1", createMcpAccess());
    const response = await call("edit_graph", { documentId: "doc-1", commands: [{ type: "removeNodes", ids: ["a"] }] });
    expect(response).toMatchObject({
      ok: false,
      error: { message: expect.stringMatching(/Edit tools are switched off/) },
    });
    expect(calls).toEqual([]);
  });

  it("follow the switches as the person changes them", async () => {
    const access = createMcpAccess();
    const { call } = shell("doc-1", access);
    expect((await call("undo", { documentId: "doc-1" })).ok).toBe(false);
    access.allow("edit", true);
    expect((await call("undo", { documentId: "doc-1" })).ok).toBe(true);
    access.allow("read", false);
    expect((await call("list_documents")).ok).toBe(false);
  });

  it("log every call with its document and how it ended, refusals included", async () => {
    const access = createMcpAccess(() => 0);
    const { call } = shell("doc-1", access);
    await call("get_totals", { documentId: "active" });
    await call("undo", { documentId: "doc-1" });
    expect(access.store.getState().activity).toMatchObject([
      { tool: "undo", group: "edit", document: "doc-1", status: "refused" },
      { tool: "get_totals", group: "read", document: "doc-1", status: "done" },
    ]);
  });
});

describe("edits through MCP", () => {
  it('are labelled "AI: …" in the undo history', async () => {
    const { call, calls } = shell();
    const commands = [{ type: "removeNodes", ids: ["ore"] }];
    await call("edit_graph", { documentId: "doc-1", commands, label: "Remove the ore" });
    await call("edit_graph", { documentId: "doc-1", commands });
    await call("apply_proposal", { proposalId: "proposal-1", label: "Steel for 2 yellow belts" });
    expect(calls.map((entry) => JSON.parse(entry.slice(entry.indexOf(" "))).label)).toEqual([
      "AI: Remove the ore",
      "AI: Edit",
      "AI: Steel for 2 yellow belts",
    ]);
  });
});
