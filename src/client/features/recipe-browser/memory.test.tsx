// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import fc from "fast-check";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Preferences } from "../../../contracts/preferences";
import { ConnectorProvider } from "../../core/connector";
import { fakeConnector } from "../../scenes/fake-backend";
import {
  memoryOf,
  RECENT_LIMIT,
  rememberAdded,
  toggleFavourite,
  useRecipeMemory,
  useRecipeMemoryInPreferences,
  withFavourite,
  withRecent,
} from "./memory";

afterEach(() => useRecipeMemory.setState({ loaded: false, recipes: {} }));

const id = fc.constantFrom("iron-plate", "gear", "constructor", "toString", "wire", "rod", "screw", "pipe", "valve");

describe("withRecent", () => {
  it("puts the newest first, keeps each recipe once and remembers only a few", () => {
    fc.assert(
      fc.property(fc.array(id), id, (recent, added) => {
        const next = withRecent(recent, added);
        expect(next[0]).toBe(added);
        expect(new Set(next).size).toBe(next.length);
        expect(next.length).toBeLessThanOrEqual(RECENT_LIMIT);
        // The others keep their order.
        const others = [...new Set(recent)].filter((other) => other !== added).slice(0, RECENT_LIMIT - 1);
        expect(next.slice(1)).toEqual(others);
      }),
    );
  });
});

describe("withFavourite", () => {
  it("stars at the end, unstars wherever it is, and starring twice changes nothing", () => {
    fc.assert(
      fc.property(fc.uniqueArray(id), id, (favourites, recipe) => {
        const starred = withFavourite(favourites, recipe, true);
        expect(starred.at(-1)).toBe(recipe);
        expect(withFavourite(starred, recipe, true)).toEqual(starred);
        expect(withFavourite(starred, recipe, false)).not.toContain(recipe);
      }),
    );
  });
});

describe("the recipe memory", () => {
  it("keeps favourites and recents apart per pack, even for ids an object already has", () => {
    toggleFavourite("factorio", "gear");
    toggleFavourite("factorio", "constructor");
    rememberAdded("toString", "iron-plate");
    toggleFavourite("factorio", "gear");
    const { recipes } = useRecipeMemory.getState();
    expect(memoryOf(recipes, "factorio")).toEqual({ favourites: ["constructor"], recent: [] });
    expect(memoryOf(recipes, "toString")).toEqual({ favourites: [], recent: ["iron-plate"] });
    expect(memoryOf(recipes, "constructor")).toEqual({ favourites: [], recent: [] });
  });

  it("loads from the preferences, then saves every change to them", async () => {
    const stored: Preferences = { recipes: { template: { favourites: ["motor"], recent: [] } } };
    const setPreferences = vi.fn(async ({ preferences }: { preferences: Preferences }) => ({
      ...stored,
      ...preferences,
    }));
    const connector = fakeConnector({ workspace: { getPreferences: async () => stored, setPreferences } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConnectorProvider connector={connector}>{children}</ConnectorProvider>
    );
    renderHook(() => useRecipeMemoryInPreferences(), { wrapper });
    await waitFor(() => expect(useRecipeMemory.getState().loaded).toBe(true));
    expect(memoryOf(useRecipeMemory.getState().recipes, "template").favourites).toEqual(["motor"]);
    expect(setPreferences).not.toHaveBeenCalled();

    rememberAdded("template", "circuit");
    await waitFor(() =>
      expect(setPreferences).toHaveBeenCalledWith({
        preferences: { recipes: { template: { favourites: ["motor"], recent: ["circuit"] } } },
      }),
    );
  });
});
