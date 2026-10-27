import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { managers, type MethodContract } from "../src/contracts/managers";
import { buildManifest, MANIFEST_FILE, render } from "./mcp-tools";

const manifest = buildManifest(managers);

describe("the MCP manifest", () => {
  it(`is up to date in ${MANIFEST_FILE} (run \`pnpm mcp:tools\`)`, () => {
    expect(readFileSync(MANIFEST_FILE, "utf8")).toBe(render(manifest));
  });

  it("describes each tool with its manager method and the JSON Schema of the method's arguments", () => {
    const edit = manifest.tools.find(({ name }) => name === "edit_graph");
    expect(edit).toMatchObject({ group: "edit", manager: "editing", method: "apply" });
    expect(edit?.inputSchema).toMatchObject({
      type: "object",
      properties: { documentId: { type: "string" }, commands: { type: "array" }, label: { type: "string" } },
      required: ["documentId", "commands"],
    });
  });

  it("includes methods that other managers expose later, without changes here", () => {
    const planning = {
      planning: {
        planProduction: {
          args: z.object({ targets: z.record(z.string(), z.number()) }),
          mcp: { tool: "plan_production", group: "plan", description: "Plan a production line." },
        } satisfies MethodContract,
      },
    };
    expect(buildManifest({ ...managers, ...planning }).tools.map(({ name }) => name)).toContain("plan_production");
  });

  it("tells clients they may name the document on screen as `active`", () => {
    const graph = manifest.tools.find(({ name }) => name === "get_graph");
    expect(graph?.inputSchema).toMatchObject({ properties: { documentId: { description: /"active"/ } } });
  });

  it("names tools as MCP clients accept them", () => {
    for (const { name } of manifest.tools) expect(name).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
  });

  it("marks only the read tools as read-only", () => {
    for (const { group, annotations } of manifest.tools) {
      expect(annotations.readOnlyHint).toBe(group === "read");
    }
  });

  it("serves the JSON Schemas and the plugin API as resources", () => {
    const byUri = new Map(manifest.resources.map((resource) => [resource.uri, resource]));
    for (const uri of ["schemas/pack-manifest.json", "schemas/pack-data.json", "schemas/document.json"]) {
      const resource = byUri.get(`carbonara://${uri}`);
      expect(resource?.mimeType).toBe("application/json");
      expect(JSON.parse(resource && "text" in resource ? resource.text : "")).toHaveProperty("type", "object");
    }
    expect(byUri.get("carbonara://docs/plugin-api.ts")).toMatchObject({
      text: expect.stringContaining("definePlugin"),
    });
  });

  it("reads the active document's summary through a read tool", () => {
    const active = manifest.resources.find(({ uri }) => uri === "carbonara://documents/active");
    expect(active).toMatchObject({ tool: "get_graph", arguments: { documentId: "active" } });
    expect(manifest.tools.find(({ name }) => active && "tool" in active && name === active.tool)?.group).toBe("read");
  });

  it("declares every argument its prompts use", () => {
    expect(manifest.prompts.map(({ name }) => name)).toEqual(["design_production_line", "create_pack"]);
    for (const prompt of manifest.prompts) {
      const used = [...prompt.text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]);
      expect(new Set(used)).toEqual(new Set(prompt.arguments.map(({ name }) => name)));
    }
  });
});
