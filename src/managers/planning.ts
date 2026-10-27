// Planning manager: the use cases "plan production for these targets", "compare the recipes for an item",
// "discard a proposal" and "convert a rate". It sequences the documents, packs and proposals stores and the
// engines: planning builds the superstructure, the pack's plugin runtime compiles it (here for built-in packs, in
// the sandbox for third-party ones), planning weighs it, the solver solves it, and planning shapes the proposal.
// Every proposal it makes is kept as pending, replacing the document's earlier one, and published with
// `proposalChanged`, so the UI shows it as a ghost whoever asked (the planner card or an MCP client).
import type { DocumentStore, LoadedPack, PackStore, ProposalStore } from "../contracts/access";
import type { Document } from "../contracts/document";
import type { Events, ManagerImplementation, PlanOptions, PlanTarget, Proposal } from "../contracts/managers";
import type { Id } from "../contracts/pack";
import { fail, ok, type Result } from "../contracts/result";
import { runtimeOf } from "../engines/compiler";
import { buildSuperstructure, convertRate, propose, rank, rivals, weigh } from "../engines/planning";
import { solve } from "../engines/solver";
import type { EventBus } from "../utilities/events";

export interface PlanningDependencies {
  documents: Pick<DocumentStore, "get">;
  packs: Pick<PackStore, "get">;
  proposals: ProposalStore;
  events: EventBus<Events>;
}

interface Context {
  document: Document;
  version: number;
  pack: LoadedPack;
}

export function createPlanningManager({
  documents,
  packs,
  proposals,
  events,
}: PlanningDependencies): ManagerImplementation<"planning"> {
  // A closed document's proposals go with it.
  events.subscribe("documentsChanged", ({ documents: open }) => {
    proposals.keepOnly(new Set(open.map((document) => document.id)));
  });

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
  ): Promise<Result<Omit<Proposal, "id">>> {
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
      const planned = await plan(found.value, targets, options);
      if (!planned.ok) return planned;
      for (const earlier of proposals.pending(documentId)) {
        proposals.settle(earlier.id, "replaced");
        events.publish("proposalChanged", { proposal: earlier, status: "replaced" });
      }
      const proposal = proposals.add(planned.value);
      events.publish("proposalChanged", { proposal, status: "pending" });
      return ok(proposal);
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
    async discardProposal({ proposalId }) {
      const stored = proposals.get(proposalId);
      if (!stored) return fail([{ path: ["proposalId"], message: `Unknown proposal ${proposalId}` }]);
      if (stored.status === "pending") {
        proposals.settle(proposalId, "discarded");
        events.publish("proposalChanged", { proposal: stored.proposal, status: "discarded" });
      }
      return ok(undefined);
    },
    async convertRate({ documentId, amount, unit }) {
      const found = await context(documentId);
      if (!found.ok) return found;
      const { document, pack } = found.value;
      return convertRate(pack.data, amount, unit, document.settings.rateUnit ?? pack.data.units.rate);
    },
  };
}
