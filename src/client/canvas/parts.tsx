// Small pieces every canvas renderer and the canvas features draw with: item chips, rates, the efficiency ring.
import type { CSSProperties, ReactNode } from "react";
import { useBuildingIcon, useItemIcon } from "../core/pack-icons";
import type { ItemForm, RateUnit } from "../../contracts/pack";
import { formatRate, type RateDisplay } from "./model/format";
import { hueOf, monogram } from "./model/item-chip";
import type { ItemView } from "./model/scene";

/** Sets the hue that the `item-tint` colours in canvas.css derive from. */
export function tint(id: string): CSSProperties {
  return { "--hue": hueOf(id) } as CSSProperties;
}

const CHIP_SIZES = {
  sm: "size-5 text-2xs tracking-tighter",
  md: "size-7 text-2xs",
  lg: "size-10 text-sm",
  xl: "size-14 text-xl",
} as const;

/**
 * An item's badge: the pack's icon on a tint of the item's own hue, or, for the many packs without icons, its
 * monogram. Fluids are round, solids square, so the shape tells them apart without colour.
 */
export function ItemChip({ item, size = "md" }: { item: ItemView; size?: keyof typeof CHIP_SIZES }) {
  const icon = useItemIcon(item.id);
  return (
    <span
      aria-hidden
      title={item.name}
      style={tint(item.id)}
      className={`item-tint grid shrink-0 place-items-center bg-(--item-bg) font-semibold text-(--item-fg) ring-1 ring-(--item-line) ring-inset select-none ${CHIP_SIZES[size]} ${item.form === "fluid" ? "rounded-full" : "rounded-sm"}`}
    >
      {icon ? <PackIcon src={icon} /> : monogram(item.name)}
    </span>
  );
}

/** A building's tile: the pack's icon, or the building's monogram. `className` sizes and colours the tile. */
export function BuildingTile({ building, className }: { building: { id: string; name: string }; className: string }) {
  const icon = useBuildingIcon(building.id);
  return (
    <span aria-hidden title={building.name} className={className}>
      {icon ? <PackIcon src={icon} /> : monogram(building.name)}
    </span>
  );
}

/** A node's mark at overview zoom: the item's icon, large, or `children` (its monogram) when its pack has none. */
export function OverviewMark({ itemId, children }: { itemId: string | undefined; children: ReactNode }) {
  const icon = useItemIcon(itemId ?? "");
  return icon ? <PackIcon src={icon} className="size-[62%]" /> : children;
}

/** The image of an icon from a pack, inside a chip or tile, which carries its name. */
export function PackIcon({ src, className = "size-[82%]" }: { src: string; className?: string }) {
  return <img src={src} alt="" draggable={false} decoding="async" className={`object-contain ${className}`} />;
}

/** A rate in the document's unit (in belts, for the items its belt carries); a dash while there is no result. */
export function Rate({
  perSecond,
  unit,
  form,
  className = "",
}: {
  perSecond: number | undefined;
  unit: RateUnit | RateDisplay;
  /** The item's form, so a belt unit applies only to what the belt carries. */
  form?: ItemForm | undefined;
  className?: string;
}) {
  if (perSecond === undefined) return <span className={`font-mono text-fg-faint ${className}`}>—</span>;
  const rate = formatRate(perSecond, unit, form);
  return (
    <span className={`font-mono whitespace-nowrap ${className}`}>
      {rate.value}
      <span className="text-fg-subtle">{rate.unit}</span>
    </span>
  );
}

/** A ring that fills with how busy the built machines are, around their count. */
export function EfficiencyRing({ efficiency, label }: { efficiency: number | undefined; label: string }) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const filled = efficiency === undefined ? 0 : circumference * Math.min(efficiency, 1);
  return (
    <span className="relative grid size-11 shrink-0 place-items-center">
      <svg viewBox="0 0 36 36" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={radius} fill="none" strokeWidth="2.5" className="stroke-line" />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className="stroke-accent transition-[stroke-dasharray] duration-(--duration-base)"
        />
      </svg>
      {/* Long counts ("0.63") close up, so they keep clear of the ring. */}
      <span className={`font-mono text-2xs font-medium text-fg ${label.length > 3 ? "tracking-tighter" : ""}`}>
        {label}
      </span>
    </span>
  );
}

/** Marks a port the node is short of; the shape carries the meaning, not only the colour. */
export function ShortIcon({ label = "Short" }: { label?: string }) {
  return (
    <svg viewBox="0 0 12 12" className="size-3 shrink-0 text-flow-over-capacity" aria-label={label} role="img">
      <path d="M6 1.5 11 10.5H1Z" fill="currentColor" />
      <path d="M6 5v2.5" stroke="var(--color-surface-2)" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="6" cy="9" r="0.7" fill="var(--color-surface-2)" />
    </svg>
  );
}
