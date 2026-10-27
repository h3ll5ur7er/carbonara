import { describe, expect, it } from "vitest";
import { createEventBus } from "./events";

interface TestEvents {
  saved: { id: string };
  closed: { id: string };
}

describe("createEventBus", () => {
  it("delivers each event to its subscribers in order", () => {
    const bus = createEventBus<TestEvents>();
    const seen: string[] = [];
    bus.subscribe("saved", ({ id }) => seen.push(`a:${id}`));
    bus.subscribe("saved", ({ id }) => seen.push(`b:${id}`));
    bus.subscribe("closed", ({ id }) => seen.push(`closed:${id}`));
    bus.publish("saved", { id: "1" });
    expect(seen).toEqual(["a:1", "b:1"]);
  });

  it("stops delivering after unsubscribing", () => {
    const bus = createEventBus<TestEvents>();
    const seen: string[] = [];
    const stop = bus.subscribe("saved", ({ id }) => seen.push(id));
    stop();
    bus.publish("saved", { id: "1" });
    expect(seen).toEqual([]);
  });

  it("lets a listener see every event, for forwarding to clients", () => {
    const bus = createEventBus<TestEvents>();
    const seen: unknown[] = [];
    bus.subscribeAll((event, payload) => seen.push([event, payload]));
    bus.publish("closed", { id: "2" });
    expect(seen).toEqual([["closed", { id: "2" }]]);
  });
});
