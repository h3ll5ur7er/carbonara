// A node's port as a React Flow handle, placed exactly where the scene's geometry says. Ports are buttons for
// the keyboard too: Enter (or Space) on one starts a connection, Enter on another ends it there, Enter again on
// the same port opens the recipe picker for it, and Escape lets go (the canvas handles that one).
import { Handle, Position, useNodeId, useStoreApi, type NodeHandle } from "@xyflow/react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { PortSide, PortView } from "../model/scene";
import { tint } from "../parts";
import { usePortPicker } from "./context";

/** Diameter of a port, in flow units. */
const PORT_SIZE = 10;

const SIDES: Record<PortSide, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

/** The handle as React Flow needs it before the DOM is measured: edges of culled nodes still find it. */
export function handleBounds(port: PortView): NodeHandle {
  return {
    id: port.handle,
    type: port.direction === "in" ? "target" : "source",
    position: SIDES[port.side],
    x: port.x - PORT_SIZE / 2,
    y: port.y - PORT_SIZE / 2,
    width: PORT_SIZE,
    height: PORT_SIZE,
  };
}

/** How a port reads to a screen reader, and in the canvas's announcements. */
export function portLabel(port: PortView): string {
  return `${port.direction === "in" ? "Input" : "Output"} ${port.item.name}`;
}

export function PortHandle({ port }: { port: PortView }) {
  const bounds = handleBounds(port);
  const nodeId = useNodeId();
  const store = useStoreApi();
  const pickFor = usePortPicker();
  const label = portLabel(port);
  const style: CSSProperties = {
    ...tint(port.item.id),
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.key !== "Enter" && event.key !== " ") || !nodeId) return;
    // The port's, not the node's (which would select it) or the canvas's.
    event.preventDefault();
    event.stopPropagation();
    const pending = store.getState().connectionClickStartHandle;
    if (pending?.nodeId === nodeId && pending.id === port.handle) {
      store.setState({ connectionClickStartHandle: null });
      pickFor(nodeId, port.handle);
      return;
    }
    // React Flow's click-to-connect does the rest: it starts here, or ends here and calls the canvas's onConnect,
    // which says "Connected" over this when the ports fit.
    store.setState({
      ariaLiveMessage: pending
        ? `Can't connect ${startLabel(pending) ?? "that port"} to ${label}.`
        : `Connecting from ${label}. Press Enter on another port to connect it, Enter again here to add a node, ` +
          "or Escape to cancel.",
    });
    event.currentTarget.click();
  };

  return (
    <Handle
      id={port.handle}
      type={bounds.type}
      position={bounds.position}
      style={style}
      className="port-handle item-tint"
      role="button"
      tabIndex={0}
      aria-label={label}
      onKeyDown={onKeyDown}
    />
  );
}

/** The label of the port a connection started from, read from the page (it may be another node's). */
function startLabel(start: { nodeId: string; id?: string | null }): string | null {
  const selector = `.react-flow__handle[data-nodeid="${CSS.escape(start.nodeId)}"][data-handleid="${CSS.escape(start.id ?? "")}"]`;
  return document.querySelector(selector)?.getAttribute("aria-label") ?? null;
}
