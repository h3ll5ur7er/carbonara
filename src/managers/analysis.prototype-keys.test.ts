// Ids named after Object.prototype's keys (CARB-83): the analysis solves a factory the same under the new names.
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import templatePlugin from "../../packs/_template/plugin/index";
import { createMemoryDocumentStore } from "../access/documents/memory";
import type { LoadedPack } from "../contracts/access";
import type { Document } from "../contracts/document";
import type { Events } from "../contracts/managers";
import type { PackData } from "../contracts/pack";
import type { AnalysisResults } from "../contracts/results";
import {
  namesOf,
  original,
  PROTOTYPE_KEYS,
  renameDocument,
  renamePack,
  renameResults,
  renamings,
} from "../engines/compiler/prototype-keys.fixture";
import { platesModule, waterLoop } from "../engines/compiler/template.fixture";
import { buildSuperstructure } from "../engines/planning";
import { loadSolver } from "../engines/solver";
import { createEventBus } from "../utilities/events";
import { createAnalysisManager } from "./analysis";

function loaded(data: PackData): LoadedPack {
  const manifest = { id: "template", name: "Template", version: "1.0.0", engine: "^1", data: "data/", plugin: "p.js" };
  return { info: { manifest, hash: "sha256-template", builtIn: true }, data, plugin: templatePlugin };
}

/** The analysis manager's results for a document. */
async function analyse(document: Document, data: PackData): Promise<AnalysisResults> {
  const documents = createMemoryDocumentStore();
  documents.put(document);
  const packs = { get: async () => loaded(data) };
  const analysis = createAnalysisManager({ bus: createEventBus<Events>(), documents, packs });
  const results = await analysis.getResults({ documentId: document.id, graph: "root" });
  if (!results) throw new Error("No results");
  return results;
}

/** Every way the template makes motors, as one document: most of its items, recipes and buildings. */
function everyWayToMotors(): Document {
  const built = buildSuperstructure({
    document: waterLoop(),
    pack: original,
    targets: [{ item: "motor", perSecond: 1 }],
    options: { objective: "resources", alternates: true, exclude: [] },
  });
  if (!built.ok) throw new Error(JSON.stringify(built.error));
  return built.value.document;
}

beforeAll(async () => {
  await loadSolver(readFileSync(new URL("../engines/solver/wasm/solver_bg.wasm", import.meta.url)));
});

describe("analysing ids named after Object.prototype's keys", () => {
  it("covers every key a plain object inherits", () => {
    expect(PROTOTYPE_KEYS).toEqual(expect.arrayContaining(["constructor", "toString", "valueOf", "hasOwnProperty"]));
  });

  it("solves to the same results under the new names", async () => {
    const documents = [waterLoop(), platesModule(), everyWayToMotors()];
    const expected = await Promise.all(documents.map((document) => analyse(document, original)));
    await fc.assert(
      fc.asyncProperty(renamings, async (renaming) => {
        const to = namesOf(renaming);
        const pack = renamePack(original, to);
        for (const [index, document] of documents.entries()) {
          const results = await analyse(renameDocument(document, to), pack);
          expect(results).toEqual(renameResults(expected[index] as AnalysisResults, to));
        }
      }),
      { numRuns: 30 },
    );
  });
});
