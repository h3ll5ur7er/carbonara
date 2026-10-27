// Hides how an item, building or frame without an icon gets its fallback look: a monogram on a tint
// whose hue follows from the id, so the same item looks the same everywhere and across sessions.

/** Initials of the first two words, or the first two letters of a single word. */
export function monogram(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0 && /\p{L}/u.test(word));
  const [first, second] = words;
  if (!first) return "?";
  if (!second) return `${first.charAt(0).toUpperCase()}${first.charAt(1).toLowerCase()}`;
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}

/** A stable hue in degrees: FNV-1a of the id with a final avalanche, so similar ids land far apart. */
export function hueOf(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  return (hash >>> 0) % 360;
}
