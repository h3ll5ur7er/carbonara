// Share links and file names as the browser sees them. A share link puts the document behind `doc=` in the
// URL fragment, which never reaches a server.

const KEY = "doc=";

/** The page URL that opens the shared document. */
export function shareUrl(href: string, fragment: string): string {
  const url = new URL(href);
  url.hash = `${KEY}${fragment}`;
  return url.toString();
}

/** The shared document in a `location.hash`, if it carries one. */
export function sharedDocumentIn(hash: string): string | null {
  const fragment = hash.replace(/^#/, "");
  return fragment.startsWith(KEY) && fragment.length > KEY.length ? fragment.slice(KEY.length) : null;
}

/** A file name for saving a document: its name without characters that file systems refuse. */
export function fileNameFor(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]/g, "-").trim();
  return `${safe || "Untitled factory"}.carbonara`;
}
