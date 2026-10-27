// Planning manager: the use cases "plan production for these targets" and "compare the recipes for an item".
// It sequences the documents and packs stores and the engines: planning builds the superstructure, the pack's
// plugin runtime compiles it (here for built-in packs, in the sandbox for third-party ones), planning weighs
// it, the solver solves it, and planning shapes the proposal.
import type { DocumentStore, LoadedPack, PackStore } from "../contracts/access";
import type { Document } from "../contracts/document";
import type { ManagerImplementation, PlanOptions, PlanTarget, Proposal } from "../contracts/managers";
import type { Id } from "../contracts/pack";
import { fail, ok, type Result } from "../contracts/result";
import { runtimeOf } from "../engines/compiler";
import { buildSuperstructure, propose, rank, rivals, weigh } from "../engines/planning";
import { solve } from "../engines/solver";

export interface PlanningDependencies {
  documents: Pick<DocumentStore, "get">;
  packs: Pick<PackStore, "get">;
}

interface Context {
  document: Document;
  version: number;
  pack: LoadedPack;
}

export function createPlanningManager({ documents, packs }: PlanningDependencies): ManagerImplementation<"planning"> {
  async function context(documentId: string): Promise<Result<Context>> {
    const open = documents.get(documentId);
    if (!open) return fail([{ path: ["documentId"], message: `Unknown document ${documentId}` }]);
    const pack = await packs.get(open.document.pack.id);
    if (!pack) return fail([{ path: ["documentId"], message: `The pack "${open.document.pack.id}" isn't installed` }]);
    return ok({ document: open.document, version: open.version, pack });
  }

  async function plan(
    { document, version, pack }: Context,
    targets: PlanTarget[],
    options: PlanOptions,
    via?: Id,
  ): Promise<Result<Proposal>> {
    const built = buildSuperstructure({
      document,
      pack: pack.data,
      // An isolated plugin can't be asked which recipes are unlocked from here; all of them are candidates.
      ...(pack.plugin && { plugin: pack.plugin }),
      targets,
      options,
      ...(via !== undefined && { via }),
    });
    if (!built.ok) return built;
    const compiled = await runtimeOf(pack).compile(built.value.document);
    const solved = await solve(weigh(compiled.model, options.objective));
    if (!solved.ok) return fail([{ path: [], message: `The pack's constraints can't be met (${solved.error})` }]);
    const results = await compiled.results(solved, version);
    return ok(propose({ superstructure: built.value, results, pack: pack.data, document }));
  }

  return {
    async planProduction({ documentId, targets, options }) {
      const found = await context(documentId);
      if (!found.ok) return found;
      return plan(found.value, targets, options);
    },
    async compareRecipes({ documentId, item, perSecond, options }) {
      const found = await context(documentId);
      if (!found.ok) return found;
      const { document, pack } = found.value;
      const comparisons = [];
      for (const recipe of rivals(pack.data, pack.plugin, document, options, item)) {
        const planned = await plan(found.value, [{ item, perSecond }], options, recipe);
        if (!planned.ok) return planned;
        comparisons.push({ recipe, summary: planned.value.summary });
      }
      return ok(rank(comparisons, options.objective));
    },
  };
}
