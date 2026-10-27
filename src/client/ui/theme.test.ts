import { describe, expect, it } from "vitest";
import { resolveTheme, toggleTheme } from "./theme";

describe("resolveTheme", () => {
  it("follows the system when there is no explicit choice", () => {
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("system", "light")).toBe("light");
  });

  it("keeps an explicit choice whatever the system prefers", () => {
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
  });
});

describe("toggleTheme", () => {
  it("switches to the theme opposite to the one on screen", () => {
    expect(toggleTheme("system", "dark")).toBe("light");
    expect(toggleTheme("system", "light")).toBe("dark");
    expect(toggleTheme("light", "dark")).toBe("dark");
    expect(toggleTheme("dark", "dark")).toBe("light");
  });
});
