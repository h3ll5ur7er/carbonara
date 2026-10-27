// What the pack UI needs to know about files and hashes.

export function isPackFile(file: { name: string }): boolean {
  return /.\.cpack$/i.test(file.name);
}

/** Enough of a SHA-256 to tell packs apart in a list; the trust prompt shows the whole hash. */
export function shortHash(hash: string): string {
  return hash.slice(0, 12);
}
