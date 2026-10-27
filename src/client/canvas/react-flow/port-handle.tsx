// A node's port as a React Flow handle, placed exactly where the scene's geometry says.
import { Handle, Position, type NodeHandle } from "@xyflow/react";
import type { CSSProperties } from "react";
import type { PortView } from "../model/scene";
import { tint } from "../parts";

/** Diameter of a port, in flow units. */
const PORT_SIZE = 10;

/** The handle as React Flow needs it before the DOM is measured: edges of culled nodes still find it. */
export function handleBounds(port: PortView): NodeHandle {
  return {
    id: port.handle,
    type: port.direction === "in" ? "target" : "source",
    position: port.direction === "in" ? Position.Left : Position.Right,
    x: port.x - PORT_SIZE / 2,
    y: port.y - PORT_SIZE / 2,
    width: PORT_SIZE,
    height: PORT_SIZE,
  };
}

export function PortHandle({ port }: { port: PortView }) {
  const bounds = handleBounds(port);
  const style: CSSProperties = {
    ...tint(port.item.id),
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
  return (
    <Handle
      id={port.handle}
      type={bounds.type}
      position={bounds.position}
      style={style}
      className="port-handle item-tint"
      aria-label={`${port.direction === "in" ? "Input" : "Output"} ${port.item.name}`}
    />
  );
}
