import { describe, expect, it } from "vitest";
import { z } from "zod";
import { managers, type MethodContract } from "../../../contracts/managers";
import { mcpTools } from "./tools";

/** The contracts as another engineer may extend them: a new manager whose method carries MCP metadata. */
const withPlanning = {
  ...managers,
  planning: {
    planProduction: {
      args: z.object({ documentId: z.string(), targets: z.record(z.string(), z.number()) }),
      mcp: { tool: "plan_production", group: "plan", description: "Plan a production line." },
    } satisfies MethodContract,
    compareRecipes: { args: z.object({}) } satisfies MethodContract,
  },
};

describe("the MCP tools", () => {
  it("are Carbonara's MCP-exposed manager methods", () => {
    expect(mcpTools(managers).map(({ tool, manager, method }) => `${tool} → ${manager}.${method}`)).toEqual([
      "list_documents → workspace.listDocuments",
      "get_graph → editing.getDocument",
      "edit_graph → editing.apply",
      "undo → editing.undo",
      "get_totals → analysis.getResults",
      "get_diagnostics → analysis.getResults",
      "plan_production → planning.planProduction",
      "compare_recipes → planning.compareRecipes",
      "list_packs → packs.listPacks",
      "get_pack_data → packs.getPackData",
    ]);
  });

  it("pick up every method with MCP metadata, in any manager, and leave the others out", () => {
    const tools = mcpTools(withPlanning);
    expect(tools.find(({ tool }) => tool === "plan_production")).toMatchObject({
      manager: "planning",
      method: "planProduction",
      group: "plan",
      args: withPlanning.planning.planProduction.args,
    });
    expect(tools.some(({ method }) => method === "compareRecipes" || method === "ping")).toBe(false);
  });

  it("let one method back several tools, each with its own view of the value", () => {
    const results = mcpTools(managers).filter(({ method }) => method === "getResults");
    expect(results.map(({ tool, view }) => [tool, view])).toEqual([
      ["get_totals", "totals"],
      ["get_diagnostics", "diagnostics"],
    ]);
  });

  it("refuse two methods claiming one tool name", () => {
    const clash = {
      a: { one: { args: z.object({}), mcp: { tool: "same", group: "read", description: "" } } },
      b: { two: { args: z.object({}), mcp: { tool: "same", group: "read", description: "" } } },
    } satisfies Record<string, Record<string, MethodContract>>;
    expect(() => mcpTools(clash)).toThrow(/same/);
  });
});
