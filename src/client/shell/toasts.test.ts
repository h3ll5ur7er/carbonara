import { beforeEach, describe, expect, it } from "vitest";
import { dismissToast, maxToasts, toast, useToasts } from "./toasts";

describe("toasts", () => {
  beforeEach(() => useToasts.setState({ toasts: [] }));

  it("shows a toast with its tone, informational by default", () => {
    toast({ title: "Added Iron Plate" });
    toast({ title: "Couldn't apply the edit", description: "Clock must be at most 250", tone: "error" });
    expect(useToasts.getState().toasts).toMatchObject([
      { title: "Added Iron Plate", tone: "info" },
      { title: "Couldn't apply the edit", description: "Clock must be at most 250", tone: "error" },
    ]);
  });

  it("gives every toast its own id", () => {
    const first = toast({ title: "One" });
    const second = toast({ title: "Two" });
    expect(first).not.toBe(second);
  });

  it("keeps only the newest few on screen", () => {
    for (let i = 0; i < maxToasts + 2; i++) toast({ title: `Toast ${i}` });
    const titles = useToasts.getState().toasts.map((shown) => shown.title);
    expect(titles).toHaveLength(maxToasts);
    expect(titles.at(-1)).toBe(`Toast ${maxToasts + 1}`);
  });

  it("dismisses a toast by id", () => {
    const id = toast({ title: "Gone soon" });
    toast({ title: "Stays" });
    dismissToast(id);
    expect(useToasts.getState().toasts.map((shown) => shown.title)).toEqual(["Stays"]);
  });
});
