import { afterEach, describe, expect, it } from "vitest";
import { panelWidths } from "./panel-layout";
import { setFactoryOpen, setPanelOpen, togglePanel, usePanels } from "./panels";

const initial = usePanels.getState();
afterEach(() => usePanels.setState(initial, true));

const shown = () => ({ left: usePanels.getState().left.open, right: usePanels.getState().right.open });

describe("the side panels", () => {
  it("both open once a factory is open: the library and the inspector", () => {
    expect(shown()).toEqual({ left: true, right: true });
    expect(usePanels.getState().left.width).toBe(panelWidths.left.default);
  });

  it("stay closed while no factory is open, and come back as they were once one opens (CARB-116)", () => {
    setPanelOpen("left", false);
    setFactoryOpen(false);
    expect(shown()).toEqual({ left: false, right: false });
    setFactoryOpen(true);
    expect(shown()).toEqual({ left: false, right: true });
  });

  it("remember a toggle made while no factory is open for when one opens", () => {
    setFactoryOpen(false);
    togglePanel("right");
    expect(shown()).toEqual({ left: false, right: false });
    setFactoryOpen(true);
    expect(shown()).toEqual({ left: true, right: false });
  });
});
