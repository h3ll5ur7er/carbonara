// A node's colour tag: a small tab on its top edge, the same for every kind of node, so the wrapper adds it
// around each node component instead of each drawing its own.
import { memo, type ComponentType } from "react";
import type { NodeView } from "../model/scene";

export function withTag<P extends { data: { view: NodeView } }>(Node: ComponentType<P>): ComponentType<P> {
  return memo(function Tagged(props: P) {
    const tag = props.data.view.tag;
    return (
      <>
        <Node {...props} />
        {tag && <span aria-label={`Tagged ${tag}`} role="img" data-tag={tag} className="node-tag item-tint" />}
      </>
    );
  });
}
