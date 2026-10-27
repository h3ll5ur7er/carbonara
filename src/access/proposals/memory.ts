// Proposals access, in memory: the planner's proposals of this session and where each stands. Hides how they're
// held and how their ids are made; proposals aren't saved, a restart starts without any.
import type { ProposalStore } from "../../contracts/access";
import type { Proposal, ProposalStatus } from "../../contracts/managers";

export function createMemoryProposalStore(): ProposalStore {
  const proposals = new Map<string, { proposal: Proposal; status: ProposalStatus }>();
  let made = 0;
  return {
    add(content) {
      const proposal = { id: `proposal-${++made}`, ...content };
      proposals.set(proposal.id, { proposal, status: "pending" });
      return proposal;
    },
    get: (proposalId) => proposals.get(proposalId),
    settle(proposalId, status) {
      const entry = proposals.get(proposalId);
      if (entry) proposals.set(proposalId, { ...entry, status });
    },
    pending: (documentId) =>
      [...proposals.values()]
        .filter(({ proposal, status }) => status === "pending" && proposal.documentId === documentId)
        .map(({ proposal }) => proposal),
    keepOnly(documentIds) {
      for (const [id, { proposal }] of proposals) if (!documentIds.has(proposal.documentId)) proposals.delete(id);
    },
  };
}
