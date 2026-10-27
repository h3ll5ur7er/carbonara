// What a screen reader hears when a solve changes how the factory stands: what it's short of and which raw
// resources it draws beyond the map. Names only, no rates, so the words change when the problems do, not on every
// solve while a value is being dragged; and nothing at all while nothing is wrong.
import type { SummaryFacts } from "./summary";

/** Longer lists are counted ("and 2 more"): a screen reader reads every word. */
const NAMED = 3;

const list = new Intl.ListFormat("en-GB", { type: "conjunction" });

function names(items: { item: { name: string } }[]): string {
  const named = items.slice(0, NAMED).map(({ item }) => item.name);
  const more = items.length - named.length;
  return list.format(more > 0 ? [...named, `${more} more`] : named);
}

export function problemsAnnouncement(facts: Pick<SummaryFacts, "shortfalls" | "raw">): string {
  const over = facts.raw.filter(
    (entry) => entry.limitPerSecond !== undefined && entry.perSecond > entry.limitPerSecond,
  );
  const parts = [
    facts.shortfalls.length > 0 ? `Short of ${names(facts.shortfalls)}.` : "",
    over.length > 0 ? `${names(over)} over the map's limit.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}
