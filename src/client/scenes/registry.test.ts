import { describe, expect, it } from "vitest";
import { pickScene, type SceneRegistry } from "./registry";

const load = () => Promise.resolve({ default: () => null });
const registry: SceneRegistry = {
  gallery: { title: "Primitives gallery", load },
  chain: { title: "A 20-node chain", load, placeholder: true },
};

describe("pickScene", () => {
  it("shows the app when the URL names no scene", () => {
    expect(pickScene("", registry)).toEqual({ kind: "app" });
    expect(pickScene("?document=abc", registry)).toEqual({ kind: "app" });
  });

  it("finds the scene named by ?scene=", () => {
    expect(pickScene("?scene=gallery", registry)).toEqual({ kind: "scene", name: "gallery", scene: registry.gallery });
  });

  it("lists the scenes when the name is empty or unknown", () => {
    expect(pickScene("?scene=", registry)).toEqual({ kind: "index", requested: "" });
    expect(pickScene("?scene=nope", registry)).toEqual({ kind: "index", requested: "nope" });
  });
});
