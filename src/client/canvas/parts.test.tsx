// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PackIconsProvider } from "../core/pack-icons";
import { BuildingTile, ItemChip } from "./parts";

afterEach(cleanup);

const icons = {
  items: new Map([["ore", "data:image/webp;base64,b3Jl"]]),
  buildings: new Map([["press", "data:press"]]),
};

describe("ItemChip", () => {
  it("draws the pack's icon when there is one", () => {
    const { container } = render(
      <PackIconsProvider value={icons}>
        <ItemChip item={{ id: "ore", name: "Iron Ore", form: "solid" }} />
      </PackIconsProvider>,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe("data:image/webp;base64,b3Jl");
    expect(container.textContent).toBe("");
  });

  it("draws the monogram without one", () => {
    const { container } = render(<ItemChip item={{ id: "ore", name: "Iron Ore", form: "solid" }} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("IO");
  });
});

describe("BuildingTile", () => {
  it("draws the pack's icon, or the building's monogram", () => {
    const press = { id: "press", name: "Hydraulic Press" };
    const { container } = render(
      <PackIconsProvider value={icons}>
        <BuildingTile building={press} className="tile" />
        <BuildingTile building={{ id: "kiln", name: "Kiln" }} className="tile" />
      </PackIconsProvider>,
    );
    const [withIcon, without] = container.querySelectorAll(".tile");
    expect(withIcon?.querySelector("img")?.getAttribute("src")).toBe("data:press");
    expect(without?.textContent).toBe("Ki");
  });
});
