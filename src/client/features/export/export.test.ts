import { describe, expect, it } from "vitest";
import { imageFileName } from "./export";

describe("imageFileName", () => {
  it("names the picture after the factory", () => {
    expect(imageFileName("Motor factory", "png")).toBe("Motor factory.png");
    expect(imageFileName("Iron / Steel: v2", "svg")).toBe("Iron - Steel- v2.svg");
    expect(imageFileName("  ", "png")).toBe("factory.png");
  });
});
