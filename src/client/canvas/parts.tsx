// Small pieces every canvas renderer and the canvas features draw with: item chips, rates, the efficiency ring.
import type { CSSProperties } from "react";
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
 * An item's badge. Packs may leave out icons, so this is the fallback for all of them: a monogram on a tint
 * of the item's own hue. Fluids are round, solids square, so the shape tells them apart without colour.
 */
export function ItemChip({ item, size = "md" }: { item: ItemView; size?: keyof typeof CHIP_SIZES }) {
  return (
    <span
      aria-hidden
      title={item.name}
      style={tint(item.id)}
      className={`item-tint grid shrink-0 place-items-center bg-(--item-bg) font-semibold text-(--item-fg) ring-1 ring-(--item-line) ring-inset select-none ${CHIP_SIZES[size]} ${item.form === "fluid" ? "rounded-full" : "rounded-sm"}`}
    >
      {monogram(item.name)}
    </span>
  );
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
    <span className="relative grid size-10 shrink-0 place-items-center">
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
      <span className="font-mono text-2xs font-medium text-fg">{label}</span>
    </span>
  );
}

/** Marks a port the node is short of; the shape carries the meaning, not only the colour. */
export function ShortIcon() {
  return (
    <svg viewBox="0 0 12 12" className="size-3 shrink-0 text-flow-over-capacity" aria-label="Short" role="img">
      <path d="M6 1.5 11 10.5H1Z" fill="currentColor" />
      <path d="M6 5v2.5" stroke="var(--color-surface-2)" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="6" cy="9" r="0.7" fill="var(--color-surface-2)" />
    </svg>
  );
}
