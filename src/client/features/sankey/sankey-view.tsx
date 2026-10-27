// The Sankey overview: the whole factory as bands of flow over the canvas, clear of the side panels. `S` or
// the command palette toggles it, Escape closes it. Bands take their item's tint and pass through junctions; flows
// near or over their belt's capacity get the canvas's amber or red halo, so bottlenecks stand out at a glance.
import { Waves, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { create } from "zustand";
import type { Document } from "../../../contracts/document";
import type { PackData, RateUnit } from "../../../contracts/pack";
import type { AnalysisResults } from "../../../contracts/results";
import { formatRate } from "../../canvas/model/format";
import { hueOf } from "../../canvas/model/item-chip";
import { createSceneBuilder } from "../../canvas/model/scene";
import { usePanels } from "../../shell/panels";
import { IconButton } from "../../ui/button";
import { cx } from "../../ui/cx";
import { estimateLabelWidth, NODE_WIDTH, sankeyLayout, type SankeyLink, type SankeyNode } from "./sankey";

export const useSankey = create<{ open: boolean }>(() => ({ open: false }));

export function toggleSankey(): void {
  useSankey.setState(({ open }) => ({ open: !open }));
}

const MARGIN = 12;

export interface SankeyOverlayProps {
  document: Document;
  pack: PackData;
  results: AnalysisResults | null;
  rateUnit: RateUnit;
}

export function SankeyOverlay(props: SankeyOverlayProps) {
  const open = useSankey((state) => state.open);
  return open ? <SankeyView {...props} /> : null;
}

function SankeyView({ document, pack, results, rateUnit }: SankeyOverlayProps) {
  const left = usePanels((panels) => (panels.left.open ? panels.left.width + 2 * MARGIN : MARGIN));
  const right = usePanels((panels) => (panels.right.open ? panels.right.width + 2 * MARGIN : MARGIN));
  const area = useRef<HTMLDivElement>(null);
  const size = useSize(area);
  const [buildScene] = useState(createSceneBuilder);
  const layout = useMemo(() => {
    if (!size) return null;
    const scene = buildScene(document.graph, document.layout.root, pack);
    const labelWidth = (node: SankeyNode) => {
      const rate = formatRate(node.throughput, rateUnit);
      return estimateLabelWidth(node, `${rate.value}${rate.unit}`);
    };
    return sankeyLayout(scene, results?.documentId === document.id ? results : null, size, labelWidth);
  }, [buildScene, document, pack, results, size, rateUnit]);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") useSankey.setState({ open: false });
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  return (
    <section
      aria-label="Sankey overview"
      className="absolute inset-0 z-[5] animate-fade-in bg-canvas/95 backdrop-blur-scrim"
    >
      <header
        style={{ left, right }}
        className="absolute top-3 flex h-9 items-center gap-3 rounded-full bg-glass py-1 pr-1.5 pl-1.5 shadow-panel backdrop-blur-glass"
      >
        <span className="grid size-6 place-items-center rounded-full bg-accent-soft text-accent-fg">
          <Waves className="size-3.5" aria-hidden />
        </span>
        <h2 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Sankey overview</h2>
        <span className="text-xs text-fg-subtle">Bands as wide as their flow</span>
        <ul className="ml-auto flex items-center gap-3 text-2xs text-fg-subtle" aria-label="Legend">
          <li className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full bg-flow-near-capacity/60" aria-hidden /> Near capacity
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full bg-flow-over-capacity/70" aria-hidden /> Over capacity
          </li>
        </ul>
        <IconButton label="Close the overview" shortcut={["S"]} icon={<X />} size="sm" onClick={toggleSankey} />
      </header>
      <div ref={area} style={{ left, right }} className="absolute top-15 bottom-3">
        {layout && layout.nodes.length === 0 && (
          <p className="grid h-full place-items-center text-sm text-fg-subtle">Nothing flows yet.</p>
        )}
        {layout && size && layout.nodes.length > 0 && (
          <svg
            width={size.width}
            height={size.height}
            className="overflow-visible"
            role="img"
            aria-label="Flows of the factory"
          >
            <g>
              {layout.links.map((link) => (
                <Band
                  key={link.id}
                  link={link}
                  dimmed={hovered !== null && hovered !== link.source && hovered !== link.target && hovered !== link.id}
                  onHover={setHovered}
                />
              ))}
            </g>
            <g>
              {layout.nodes.map((node) => (
                <Bar
                  key={node.id}
                  node={node}
                  unit={rateUnit}
                  dimmed={hovered !== null && hovered !== node.id && !touches(layout.links, hovered, node.id)}
                  onHover={setHovered}
                />
              ))}
            </g>
          </svg>
        )}
      </div>
    </section>
  );
}

function touches(links: SankeyLink[], hovered: string, node: string): boolean {
  return links.some(
    (link) =>
      (link.id === hovered && (link.source === node || link.target === node)) ||
      (link.source === hovered && link.target === node) ||
      (link.target === hovered && link.source === node),
  );
}

function tint(item: string | undefined): CSSProperties | undefined {
  return item === undefined ? undefined : ({ "--hue": hueOf(item) } as CSSProperties);
}

function Band({ link, dimmed, onHover }: { link: SankeyLink; dimmed: boolean; onHover(id: string | null): void }) {
  const halo = link.saturation === "over-capacity" || link.saturation === "near-capacity";
  return (
    <g
      className="item-tint transition-opacity duration-(--duration-fast)"
      style={{ ...tint(link.item), opacity: dimmed ? 0.25 : 1 }}
      onPointerEnter={() => onHover(link.id)}
      onPointerLeave={() => onHover(null)}
    >
      {link.backward ? (
        <path
          d={link.path}
          fill="none"
          strokeWidth={Math.max(link.width, 1)}
          strokeDasharray="6 4"
          className="stroke-(--item-fg) opacity-40 hover:opacity-70"
        />
      ) : (
        <path
          d={link.path}
          strokeWidth={halo ? 2 : 0}
          className={cx(
            "fill-(--item-fg) [fill-opacity:0.32] hover:[fill-opacity:0.55]",
            link.saturation === "over-capacity" && "stroke-flow-over-capacity",
            link.saturation === "near-capacity" && "stroke-flow-near-capacity",
          )}
        />
      )}
    </g>
  );
}

function Bar({
  node,
  unit,
  dimmed,
  onHover,
}: {
  node: SankeyNode;
  unit: RateUnit;
  dimmed: boolean;
  onHover(id: string | null): void;
}) {
  const rate = formatRate(node.throughput, unit);
  const fill =
    node.kind === "recipe" ? "fill-accent" : node.kind === "junction" ? "fill-line-strong" : "fill-(--item-fg)";
  return (
    <g
      className="item-tint transition-opacity duration-(--duration-fast)"
      style={{ ...tint(node.item), opacity: dimmed ? 0.35 : 1 }}
      onPointerEnter={() => onHover(node.id)}
      onPointerLeave={() => onHover(null)}
    >
      <rect x={node.x} y={node.y} width={NODE_WIDTH} height={node.height} rx={3} className={fill} />
      <text
        x={node.labelAt.x}
        y={node.labelAt.y}
        dominantBaseline="middle"
        textAnchor={node.labelAt.anchor}
        // The layout keeps labels clear of the bands; a thin halo in the canvas colour softens a band's tip.
        className="pointer-events-none fill-fg stroke-canvas text-2xs font-medium [paint-order:stroke] [stroke-linejoin:round] [stroke-width:2px]"
      >
        {node.label}
        <tspan className="fill-fg-subtle font-mono" dx={6}>
          {rate.value}
          {rate.unit}
        </tspan>
      </text>
    </g>
  );
}

/** The element's size, following resizes. */
function useSize(element: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const target = element.current;
    if (!target) return;
    const measure = () => setSize({ width: target.clientWidth, height: target.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, [element]);
  return size;
}
