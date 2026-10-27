// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../../ui/tooltip";
import { Breadcrumbs, type BreadcrumbsProps } from "./breadcrumbs";

const crumbs = [
  { label: "Wire works", depth: 0 },
  { label: "Copper line", depth: 1 },
  { label: "Smelting", depth: 2 },
];

function renderCrumbs(props: Partial<BreadcrumbsProps> = {}) {
  const handlers = { onLeaveTo: vi.fn(), onRename: vi.fn() };
  render(
    <TooltipProvider>
      <Breadcrumbs crumbs={crumbs} instances={1} {...handlers} {...props} />
    </TooltipProvider>,
  );
  return handlers;
}

afterEach(cleanup);

describe("the subgraph breadcrumbs", () => {
  it("lead back to any level above, and up one level", async () => {
    const { onLeaveTo } = renderCrumbs();
    await userEvent.click(screen.getByRole("button", { name: "Wire works" }));
    await userEvent.click(screen.getByRole("button", { name: "Copper line" }));
    await userEvent.click(screen.getByRole("button", { name: "Leave subgraph" }));
    expect(onLeaveTo.mock.calls).toEqual([[0], [1], [1]]);
    // The level on screen is no link.
    expect(screen.queryByRole("button", { name: "Smelting" })).toBeNull();
  });

  it("rename the blueprint on screen in place: Enter keeps the name, Escape drops it", async () => {
    const { onRename } = renderCrumbs();
    await userEvent.dblClick(screen.getByText("Smelting"));
    const field = screen.getByRole("textbox", { name: "Blueprint name" });
    await userEvent.clear(field);
    await userEvent.type(field, "Iron smelting{Enter}");
    expect(onRename).toHaveBeenCalledExactlyOnceWith("Iron smelting");

    await userEvent.dblClick(screen.getByText("Smelting"));
    await userEvent.type(screen.getByRole("textbox", { name: "Blueprint name" }), " 2{Escape}");
    expect(onRename).toHaveBeenCalledOnce();
  });

  it("say when the rates add up several instances", () => {
    renderCrumbs({ instances: 3 });
    expect(screen.getByText("3 instances")).toBeTruthy();
    cleanup();
    renderCrumbs({ instances: 1 });
    expect(screen.queryByText(/instances/)).toBeNull();
  });
});
