import { describe, expect, it } from "vitest";
import { canvasShown, openWhole, opensWhole } from "./viewport";

describe("openWhole", () => {
  it("is off until asked for", () => {
    expect(opensWhole()).toBe(false);
  });

  it("lasts for the next canvas only, until it is shown", () => {
    openWhole("next");
    expect(opensWhole()).toBe(true);
    canvasShown();
    expect(opensWhole()).toBe(false);
  });

  it("lasts for every canvas when always", () => {
    openWhole("always");
    canvasShown();
    expect(opensWhole()).toBe(true);
  });
});
