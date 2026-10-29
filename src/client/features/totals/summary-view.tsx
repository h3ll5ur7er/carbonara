// The pieces a summary card is made of: stat tiles, titled lists of buildings and item rates, and a bar of a
// raw resource against the map's limit. The planner's proposal card and the totals card share them.
import { Factory, Pickaxe, TriangleAlert, Zap } from "lucide-react";
import type { ReactNode } from "react";
import type { Item, RateUnit } from "../../../contracts/pack";
import { fromPerSecond, rateSuffix } from "../../../utilities/units";
import { formatNumber } from "../../canvas/model/format";
import { BuildingTile, ItemChip, Rate } from "../../canvas/parts";
import { cx } from "../../ui/cx";
import type { SummaryFacts } from "./summary";

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-2xs font-medium tracking-wide text-fg-faint uppercase">{children}</h3>;
}

/** Machines, power and total raw input as three tiles. */
export function SummaryStats({ facts, powerMW, unit }: { facts: SummaryFacts; powerMW: number; unit: RateUnit }) {
  const raw = facts.raw.reduce((total, entry) => total + entry.perSecond, 0);
  return (
    <dl className="grid grid-cols-3 gap-1.5">
      <Stat icon={<Factory />} label="Machines" value={compactNumber(facts.machines)} />
      <Stat icon={<Zap />} label="Power" value={compactNumber(powerMW)} unit="MW" />
      <Stat
        icon={<Pickaxe />}
        label="Raw input"
        value={compactNumber(fromPerSecond(raw, unit))}
        unit={rateSuffix(unit)}
      />
    </dl>
  );
}

/** Short enough for a tile: 2,860, then 50.3k, 1.2M. */
export function compactNumber(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1e6) return `${formatNumber(value / 1e6)}M`;
  if (magnitude >= 1e4) return `${formatNumber(value / 1e3)}k`;
  return formatNumber(value);
}

function Stat({ icon, label, value, unit }: { icon: ReactNode; label: string; value: ReactNode; unit?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md bg-surface-2/70 px-2.5 py-2 inset-ring inset-ring-line-subtle">
      <dt className="flex items-center gap-1 text-2xs text-fg-subtle [&_svg]:size-3">
        {icon}
        {label}
      </dt>
      <dd className="truncate font-mono text-base font-medium text-fg">
        {value}
        {unit && <span className="ml-0.5 text-xs text-fg-subtle">{unit}</span>}
      </dd>
    </div>
  );
}

/** A titled list below a hairline; `title` names the section for screen readers too. */
export function SummaryList({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1.5 border-t border-line-subtle px-4 pt-3 pb-3.5">
      <SectionTitle>
        <span className="flex items-center gap-1 [&_svg]:size-3">
          {icon}
          {title}
        </span>
      </SectionTitle>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

export function BuildingRows({ buildings }: { buildings: SummaryFacts["buildings"] }) {
  return buildings.map((building) => (
    <li key={building.id} className="flex h-7 items-center gap-2.5">
      <BuildingTile
        building={building}
        className="grid size-5 shrink-0 place-items-center rounded-xs bg-accent-soft text-2xs font-semibold text-accent-fg"
      />
      <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{building.name}</span>
      <span className="font-mono text-sm text-fg">× {formatNumber(building.count)}</span>
    </li>
  ));
}

/** Raw inputs, each with its share of the map's limit where the pack sets one. */
export function RawRows({ raw, unit }: { raw: SummaryFacts["raw"]; unit: RateUnit }) {
  return raw.map(({ item, perSecond, limitPerSecond }) => (
    <li key={item.id} className="flex flex-col gap-1 py-1">
      <div className="flex items-center gap-2.5">
        <ItemChip item={item} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{item.name}</span>
        <Rate perSecond={perSecond} unit={unit} className="text-sm text-fg" />
      </div>
      {limitPerSecond !== undefined && <LimitBar used={perSecond} limit={limitPerSecond} unit={unit} />}
    </li>
  ));
}

export function ItemRows({ rates, unit }: { rates: { item: Item; perSecond: number }[]; unit: RateUnit }) {
  return rates.map(({ item, perSecond }) => (
    <li key={item.id} className="flex h-7 items-center gap-2.5">
      <ItemChip item={item} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{item.name}</span>
      <Rate perSecond={perSecond} unit={unit} className="text-sm text-fg" />
    </li>
  ));
}

/** How much of the map's limit a raw resource takes: healthy, amber above 90%, red over it (and said so). */
export function LimitBar({ used, limit, unit }: { used: number; limit: number; unit: RateUnit }) {
  const share = used / limit;
  const over = share > 1 + 1e-9;
  const tone = over ? "bg-flow-over-capacity" : share > 0.9 ? "bg-flow-near-capacity" : "bg-flow-healthy";
  return (
    <div className="flex items-center gap-2 pl-7.5">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-4">
        <div className={cx("h-full rounded-full", tone)} style={{ width: `${Math.min(share, 1) * 100}%` }} />
      </div>
      <span
        className={cx(
          "flex items-center gap-1 font-mono text-2xs",
          over ? "text-flow-over-capacity" : "text-fg-subtle",
        )}
      >
        {over && <TriangleAlert className="size-3" aria-label="Over the map's limit" />}
        {formatNumber(share * 100)}% of <Rate perSecond={limit} unit={unit} className="text-2xs" />
      </span>
    </div>
  );
}

/**
 * A red callout listing what's short. `alert` reads it out when it appears: right for a plan's one-off result, not
 * for totals that follow every solve (they announce in words that change less often, see announcement.ts).
 */
export function Shortfalls({
  title,
  shortfalls,
  unit,
  alert = false,
}: {
  title: string;
  shortfalls: SummaryFacts["shortfalls"];
  unit: RateUnit;
  alert?: boolean;
}) {
  if (shortfalls.length === 0) return null;
  return (
    <div
      role={alert ? "alert" : undefined}
      className="flex gap-2.5 rounded-md bg-danger-soft px-3 py-2.5 text-xs text-danger inset-ring inset-ring-danger/25"
    >
      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
        {shortfalls.map(({ item, perSecond }) => (
          <p key={item.id} className="text-fg-muted">
            Short of <Rate perSecond={perSecond} unit={unit} className="text-danger" /> {item.name}
          </p>
        ))}
      </div>
    </div>
  );
}
