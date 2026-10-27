import { describe, expect, it } from "vitest";
import { isPackFile, shortHash } from "./pack-files";

describe("pack files", () => {
  it("are the files whose name ends in .cpack, in any case", () => {
    expect(isPackFile({ name: "satisfactory-1.0.0.cpack" })).toBe(true);
    expect(isPackFile({ name: "DEMO.CPACK" })).toBe(true);
    expect(isPackFile({ name: "factory.carbonara" })).toBe(false);
    expect(isPackFile({ name: "cpack" })).toBe(false);
  });

  it("are recognised at a glance by the start of their hash", () => {
    expect(shortHash("e00cbe088a9d3868fbfa19fe0cf0233fb075393e431d18eba8eb6bda25060656")).toBe("e00cbe088a9d");
  });
});
