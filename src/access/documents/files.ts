// The `.carbonara` file format: the document as gzipped UTF-8 JSON. Reading also accepts plain JSON (a file
// someone unzipped and edited by hand) and upgrades older versions.
import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";
import type { Document } from "../../contracts/document";
import { fail, type Result } from "../../contracts/result";
import { upgradeDocument } from "./migrations";

export function writeDocumentFile(document: Document): Uint8Array<ArrayBuffer> {
  return gzipSync(strToU8(JSON.stringify(document)));
}

export function readDocumentFile(bytes: Uint8Array): Result<Document> {
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(isGzip(bytes) ? gunzipSync(bytes) : bytes));
  } catch {
    // Damaged gzip streams and invalid JSON are expected input, not bugs.
    return fail([{ path: [], message: "Not a Carbonara document" }]);
  }
  return upgradeDocument(raw);
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
}
