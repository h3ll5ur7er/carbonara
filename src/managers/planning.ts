// Planning manager: the use cases "plan production for these targets", "compare the recipes for an item",
// "discard a proposal" and "convert a rate". It sequences the documents, packs and proposals stores and the
// engines: the pack's plugin runtime says which recipes the save allows, planning builds the superstructure, the
// runtime compiles it (here for built-in packs, in the sandbox for third-party ones), planning weighs it, the
// solver solves it, planning shapes the proposal and the layout engine lays it out. Every proposal it makes is
// kept as pending, replacing the document's earlier one, and published with `proposalChanged`, so the UI shows it
// as a ghost whoever asked (the planner card or an MCP client).
import type { DocumentStore, LoadedPack, PackStore, PluginRuntime, ProposalStore } from "../contracts/access";
import type { Document } from "../contracts/document";
import type {
  Events,
  ManagerImplementation,
  PlanOptions,
  PlanRequestOptions,
  PlanTarget,
  Proposal,
} from "../contracts/managers";
import type { Id } from "../contracts/pack";
import { fail, ok, type Result } from "../contracts/result";
import { runtimeOf } from "../engines/compiler";
import { arrange, type ElkRunner } from "../engines/layout/arrange";
import {
  allowedRecipes,
  buildSuperstructure,
  convertRate,
  placeBeside,
  probeDocument,
  propose,
  proposalLayout,
  rank,
  ratesOf,
  type RecipeRates,
  rivals,
  runningOnce,
  weigh,
} from "../engines/planning";
import { solve } from "../engines/solver";
import type { EventBus } from "../utilities/events";
import { own } from "../utilities/records";

export interface PlanningDependencies {
  documents: Pick<DocumentStore, "get">;
  packs: Pick<PackStore, "get">;
  proposals: ProposalStore;
  events: EventBus<Events>;
  /** Runs ELK for the layout engine (in a worker of its own in the app). */
  layout: ElkRunner;
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
  layout,
}: PlanningDependencies): ManagerImplementation<"planning"> {
  // A closed document's proposals go with it.
  events.subscribe("documentsChanged", ({ documents: open }) => {
    proposals.keepOnly(new Set(open.map((document) => document.id)));
  });

  /** The request's options, with the buildings and resource weights saved with the document where it names none. */
  function withSaved(options: PlanRequestOptions, { document }: Context): PlanOptions {
    const saved = document.settings.planning;
    return {
      ...options,
      buildings: options.buildings ?? saved?.buildings ?? [],
      resourceWeights: options.resourceWeights ?? saved?.resourceWeights ?? {},
    };
  }

  async function context(documentId: string): Promise<Result<Context>> {
    const open = documents.get(documentId);
    if (!open) return fail([{ path: ["documentId"], message: `Unknown document ${documentId}` }]);
    const pack = await packs.get(open.document.pack.id);
    if (!pack) return fail([{ path: ["documentId"], message: `The pack "${open.document.pack.id}" isn't installed` }]);
    return ok({ document: open.document, version: open.version, pack });
  }

  /**
   * The candidates as nodes run them, in the buildings the plan would use: the plugin may add inputs and outputs
   * (fuel) the pack's recipes don't list.
   */
  async function asRun({ document, version, pack }: Context, ruledOut: ReadonlySet<Id>, options: PlanOptions) {
    const candidates = allowedRecipes(pack.data, ruledOut, options);
    const probe = await runtimeOf(pack).compile(probeDocument(document, candidates, options.buildings));
    return ratesOf(await probe.results(ok(runningOnce(probe.model)), version), candidates);
  }

  /** The plan, its nodes still at the origin. */
  async function plan(
    { document, version, pack }: Context,
    targets: PlanTarget[],
    options: PlanOptions,
    ruledOut: ReadonlySet<Id>,
    rates: ReadonlyMap<Id, RecipeRates>,
    graph: string,
    via?: Id,
  ): Promise<Result<Omit<Proposal, "id">>> {
    const runtime = runtimeOf(pack);
    const built = buildSuperstructure({
      document,
      pack: pack.data,
      unavailable: ruledOut,
      targets,
      options,
      ...(via !== undefined && { via }),
      rates,
    });
    if (!built.ok) return built;
    const compiled = await runtime.compile(built.value.document);
    const solved = await solve(weigh(compiled.model, options, compiled.items));
    if (!solved.ok) return fail([{ path: [], message: `The pack's constraints can't be met (${solved.error})` }]);
    const results = await compiled.results(solved, version);
    return ok(propose({ superstructure: built.value, results, pack: pack.data, document, graph }));
  }

  return {
    async planProduction({ documentId, graph, targets, options: asked }) {
      const found = await context(documentId);
      if (!found.ok) return found;
      if (graph !== "root" && !own(found.value.document.blueprints, graph)) {
        return fail([{ path: ["graph"], message: `Unknown graph ${graph}` }]);
      }
      const options = withSaved(asked, found.value);
      const ruledOut = await unavailable(runtimeOf(found.value.pack), found.value.document);
      const rates = await asRun(found.value, ruledOut, options);
      const planned = await plan(found.value, targets, options, ruledOut, rates, graph);
      if (!planned.ok) return planned;
      const { document, pack } = found.value;
      const drawn = proposalLayout(planned.value, pack.data);
      const at = await arrange({ graph: drawn.graph, positions: {}, shapes: drawn.shapes, direction: "right" }, layout);
      const laidOut = placeBeside(planned.value, at, document, pack.data, graph);

      for (const earlier of proposals.pending(documentId)) {
        proposals.settle(earlier.id, "replaced");
        events.publish("proposalChanged", { proposal: earlier, status: "replaced" });
      }
      const proposal = proposals.add(laidOut);
      events.publish("proposalChanged", { proposal, status: "pending" });
      return ok(proposal);
    },
    async compareRecipes({ documentId, item, perSecond, options: asked }) {
      const found = await context(documentId);
      if (!found.ok) return found;
      const options = withSaved(asked, found.value);
      const { document, pack } = found.value;
      const comparisons = [];
      const ruledOut = await unavailable(runtimeOf(pack), document);
      const rates = await asRun(found.value, ruledOut, options);
      for (const recipe of rivals(pack.data, ruledOut, options, item)) {
        const planned = await plan(found.value, [{ item, perSecond }], options, ruledOut, rates, "root", recipe);
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

/** What the pack's plugin rules out under the document's save profile, wherever the plugin runs. */
async function unavailable(runtime: PluginRuntime, document: Document): Promise<ReadonlySet<Id>> {
  return new Set(await runtime.unavailableRecipes(document.settings.plugin ?? {}));
}
