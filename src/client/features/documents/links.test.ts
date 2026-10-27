import { describe, expect, it } from "vitest";
import { fileNameFor, sharedDocumentIn, shareUrl } from "./links";

describe("shareUrl", () => {
  it("puts the document behind doc= in the fragment, replacing any old fragment", () => {
    expect(shareUrl("https://example.org/carbonara/?x=1#old", "AbC_-1")).toBe(
      "https://example.org/carbonara/?x=1#doc=AbC_-1",
    );
  });
});

describe("sharedDocumentIn", () => {
  it("finds the document of a share link", () => {
    expect(sharedDocumentIn("#doc=AbC_-1")).toBe("AbC_-1");
  });

  it.each(["", "#", "#scene=chain", "#doc="])("finds nothing in %j", (hash) => {
    expect(sharedDocumentIn(hash)).toBeNull();
  });
});

describe("fileNameFor", () => {
  it("names the file after the document", () => {
    expect(fileNameFor("Iron works")).toBe("Iron works.carbonara");
  });

  it("replaces characters file systems refuse", () => {
    expect(fileNameFor('Steel: mk2 / "fast"?')).toBe("Steel- mk2 - -fast--.carbonara");
  });

  it("falls back to a name when there is none", () => {
    expect(fileNameFor("   ")).toBe("Untitled factory.carbonara");
  });
});
