import { gzipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { Document } from "../../contracts/document";
import { exampleDocument } from "../../contracts/document.fixture";
import { readDocumentFile, writeDocumentFile } from "./files";

const document = Document.parse(exampleDocument);

describe(".carbonara files", () => {
  it("are gzipped JSON", () => {
    const bytes = writeDocumentFile(document);
    expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);
  });

  it("reopen identically", () => {
    expect(readDocumentFile(writeDocumentFile(document))).toEqual({ ok: true, value: document });
  });

  it("may also be plain JSON, for files edited by hand", () => {
    expect(readDocumentFile(strToU8(JSON.stringify(exampleDocument)))).toEqual({ ok: true, value: document });
  });

  it("are upgraded from older versions on load", () => {
    const old = {
      ...exampleDocument,
      version: 0,
      graph: { nodes: { ore: { kind: "source", item: "iron-ore", x: 1, y: 2 } }, edges: {} },
    };
    const result = readDocumentFile(gzipSync(strToU8(JSON.stringify(old))));
    expect(result.ok && result.value.layout["root"]).toEqual({ ore: { x: 1, y: 2 } });
  });

  it.each([
    ["random bytes", new Uint8Array([1, 2, 3])],
    ["a damaged gzip stream", new Uint8Array([0x1f, 0x8b, 8, 0, 0])],
    ["JSON that isn't a document", strToU8("[1, 2]")],
  ])("refuse %s", (_name, bytes) => {
    expect(readDocumentFile(bytes)).toEqual({ ok: false, error: [{ path: [], message: "Not a Carbonara document" }] });
  });
});
