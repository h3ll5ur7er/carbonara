import { describe, expect, it } from "vitest";
import { describeIssue } from "./issues";

describe("describeIssue", () => {
  it("puts the file, line and column first, like a compiler", () => {
    expect(
      describeIssue({
        path: ["data/recipes.yaml", "recipes", 3, "in", "coal"],
        message: "Unknown item 'coal'",
        line: 14,
        column: 22,
      }),
    ).toBe("data/recipes.yaml:14:22: recipes[3].in.coal: Unknown item 'coal'");
  });

  it("names just the file when the problem is the whole file", () => {
    expect(describeIssue({ path: ["manifest.yaml"], message: "Missing file" })).toBe("manifest.yaml: Missing file");
  });

  it("writes a plain path when there is no location", () => {
    expect(describeIssue({ path: ["packId"], message: "Required" })).toBe("packId: Required");
    expect(describeIssue({ path: [], message: "Not a .cpack archive" })).toBe("Not a .cpack archive");
  });
});
