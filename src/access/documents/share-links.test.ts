import { describe, expect, it } from "vitest";
import { Document } from "../../contracts/document";
import { exampleDocument } from "../../contracts/document.fixture";
import { readShareLink, writeShareLink } from "./share-links";

const document = Document.parse(exampleDocument);

describe("share links", () => {
  it("fit in a URL fragment without escaping", () => {
    expect(writeShareLink(document)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("are compressed", () => {
    expect(writeShareLink(document).length).toBeLessThan(JSON.stringify(document).length);
  });

  it("open the document they were made from", () => {
    expect(readShareLink(writeShareLink(document))).toEqual({ ok: true, value: document });
  });

  it.each([
    ["an empty fragment", ""],
    ["characters a link never contains", "abc+/="],
    ["valid base64 that isn't a document", "aGVsbG8"],
    ["a truncated link", "aGVsb"],
  ])("refuse %s", (_name, fragment) => {
    expect(readShareLink(fragment)).toEqual({ ok: false, error: [{ path: [], message: "Not a Carbonara document" }] });
  });
});
