// The pack format this app reads, and whether a pack's `engine` range accepts it.
// Bump PACK_FORMAT when the manifest, data or plugin API change: minor for additions, major for breaks.

/** The pack format and plugin API version this build of Carbonara implements. */
export const PACK_FORMAT = "1.0.0";

type Version = [number, number, number];

/**
 * Whether `version` lies in `range` (`1`, `1.2`, `1.2.3`, each optionally with `^` or `~`), with npm's meaning:
 * `^` allows changes that don't touch the first non-zero part, `~` allows patch changes, and a bare range
 * matches the parts it names.
 */
export function supportsRange(range: string, version: string): boolean {
  const operator = range.match(/^[\^~]/)?.[0] ?? "";
  const parts = range.slice(operator.length).split(".").map(Number);
  const lower = pad(parts);
  const upper = upperBound(operator, parts);
  const target = pad(version.split("-")[0]?.split(".").map(Number) ?? []);
  return compare(target, lower) >= 0 && compare(target, upper) < 0;
}

/** The first version the range excludes. */
function upperBound(operator: string, parts: number[]): Version {
  let bump: number;
  if (operator === "^") {
    const firstNonZero = parts.findIndex((part) => part !== 0);
    bump = firstNonZero === -1 ? parts.length - 1 : firstNonZero;
  } else if (operator === "~") bump = Math.min(parts.length - 1, 1);
  else bump = parts.length - 1;
  const bound = pad(parts.slice(0, bump + 1));
  bound[bump] = (bound[bump] ?? 0) + 1;
  return bound;
}

function pad(parts: number[]): Version {
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function compare(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}
