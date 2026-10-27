// The system clipboard, as plain text. Browsers only let a page write it during a key press or click, but a copy
// takes a round trip to the backend: a ClipboardItem accepts the text as a promise, so the write starts while the
// key is down and finishes when the copy arrives (Safari insists on this). Reading may be refused (permissions, an
// insecure page); callers then fall back to the copy this tab made.

/** Writes the text once it's there; false when the browser refused. */
export async function writeSystemText(text: Promise<string>): Promise<boolean> {
  if (!navigator.clipboard) return false;
  try {
    if (typeof ClipboardItem !== "undefined") {
      const blob = text.then((value) => new Blob([value], { type: "text/plain" }));
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return true;
    }
  } catch {
    // Older engines take only finished blobs; plain text is next.
  }
  try {
    await navigator.clipboard.writeText(await text);
    return true;
  } catch {
    return false;
  }
}

/** The clipboard's text, or null when there's none or the browser won't say. */
export async function readSystemText(): Promise<string | null> {
  try {
    return (await navigator.clipboard?.readText()) ?? null;
  } catch {
    return null;
  }
}
