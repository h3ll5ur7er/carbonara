// The .cpack archive format: a zip of the pack's files, identified by the SHA-256 of the whole archive.
import { unzipSync } from "fflate";
import { fail, ok, type Result } from "../../contracts/result";

export interface Archive {
  files: Record<string, Uint8Array>;
  /** Hex SHA-256 of the archive bytes: the pack's identity, shown in the trust prompt. */
  hash: string;
}

export async function openArchive(bytes: Uint8Array): Promise<Result<Archive>> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    return fail([{ path: [], message: "This file isn't a .cpack archive" }]);
  }
  // Zip tools add entries for folders; a pack is only its files.
  const files = Object.fromEntries(Object.entries(entries).filter(([name]) => !name.endsWith("/")));
  return ok({ files, hash: await sha256(bytes) });
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
