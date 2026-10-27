import { describe, expect, it } from "vitest";
import { packAccentStyle, resolveTheme, toggleTheme } from "./theme";

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

describe("packAccentStyle", () => {
  it("sets the pack accent that the accent tokens derive from", () => {
    expect(packAccentStyle("#3b82f6")).toEqual({ "--pack-accent": "#3b82f6" });
  });

  it("keeps the inherited accent when the pack has none", () => {
    expect(packAccentStyle(undefined)).toEqual({});
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
