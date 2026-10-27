// The share link format: a `.carbonara` file (gzipped JSON) in base64url, to put in a URL fragment.
// The fragment never reaches a server, so a shared document stays between the people who have the link.
import { strFromU8, strToU8 } from "fflate";
import type { Document } from "../../contracts/document";
import { fail, type Result } from "../../contracts/result";
import { readDocumentFile, writeDocumentFile } from "./files";

export function writeShareLink(document: Document): string {
  const binary = strFromU8(writeDocumentFile(document), true);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function readShareLink(fragment: string): Result<Document> {
  const refused = fail([{ path: [], message: "Not a Carbonara document" }]);
  if (!/^[A-Za-z0-9_-]+$/.test(fragment)) return refused;
  let binary: string;
  try {
    binary = atob(fragment.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    // A truncated link (a length base64 can't have) is expected input, not a bug.
    return refused;
  }
  return readDocumentFile(strToU8(binary, true));
}
