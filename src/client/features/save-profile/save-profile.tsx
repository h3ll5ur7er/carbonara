// The Save profile: what the document's save has, edited in the inspector while no node is selected. The pack
// plugin's document settings (such as a somersloop budget) come as field descriptors; the unlocked alternates are
// a checklist over the pack's alternate recipes. Every edit is one `setPluginSettings` command, so one undo step.
// The planner's defaults (preferred buildings, resource weights) are here too, as in the planner card.
import { BookMarked } from "lucide-react";
import { useId, useState } from "react";
import type { PlanningSettings } from "../../../contracts/document";
import type { PackData } from "../../../contracts/pack";
import type { FieldValue, PluginDescription } from "../../../contracts/plugin";
import { useConnector } from "../../core/connector";
import { fieldEditLabel } from "../../shell/inspector/fields";
import { Field } from "../../shell/inspector/inspector";
import { errorMessage, toast } from "../../shell/toasts";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { buildingFamilies } from "../planner/plan";
import { BuildingChoices, ResourceWeights, useSavePlanning } from "../planner/planning-defaults";
import { alternatesOf, isUnlocked, nameOf, unlockEdit, unlockedCount, type UnlockChange } from "./profile";

export interface SaveProfileProps {
  documentId: string;
  pack: PackData;
  /** The document's `settings.plugin`. */
  settings: Record<string, unknown>;
  /** The plugin's settings fields; undefined while they load. */
  plugin: PluginDescription | undefined;
  /** The planner's defaults saved with the document (`settings.planning`). */
  planning?: PlanningSettings | undefined;
}

export function SaveProfile({ documentId, pack, settings, plugin, planning }: SaveProfileProps) {
  const connector = useConnector();
  const savePlanning = useSavePlanning(documentId);
  const fields = Object.entries(plugin?.settingsFields ?? {});
  const alternates = alternatesOf(pack);
  const plans = pack.resources.length > 0 || buildingFamilies(pack).length > 0;

  async function apply(changes: Record<string, unknown>, label: string) {
    try {
      const result = await connector.editing.apply({
        documentId,
        commands: [{ type: "setPluginSettings", settings: changes }],
        label,
      });
      if (!result.ok) failed(result.error.map((issue) => issue.message).join(" "));
    } catch (error) {
      failed(errorMessage(error));
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-fg inset-ring inset-ring-accent/20">
          <BookMarked className="size-4.5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col">
          <h3 className="truncate text-base font-semibold tracking-tight text-fg">Save profile</h3>
          <p className="truncate text-xs text-fg-subtle">For this whole factory</p>
        </div>
      </div>
      {fields.length > 0 && (
        <section
          aria-label="Save settings"
          className="flex flex-col gap-4 border-t border-line-subtle px-4 pt-3.5 pb-5"
        >
          <h4 className="text-2xs font-medium tracking-wide text-fg-faint uppercase">Settings</h4>
          {fields.map(([key, descriptor]) => (
            <Field
              key={key}
              descriptor={descriptor}
              value={settings[key] as FieldValue | undefined}
              onEdit={(value) => apply({ [key]: value }, fieldEditLabel(descriptor, value))}
            />
          ))}
        </section>
      )}
      {plans && (
        <section
          aria-label="Planner defaults"
          className="flex flex-col gap-3 border-t border-line-subtle px-4 pt-3.5 pb-5"
        >
          <h4 className="text-2xs font-medium tracking-wide text-fg-faint uppercase">Planner</h4>
          <BuildingChoices pack={pack} saved={planning} onEdit={savePlanning} />
          <ResourceWeights pack={pack} saved={planning} onEdit={savePlanning} />
        </section>
      )}
      {alternates.length > 0 && (
        <Alternates
          pack={pack}
          settings={settings}
          onChange={(change) => {
            const edit = unlockEdit(pack, settings, change);
            return apply(edit.settings, edit.label);
          }}
        />
      )}
    </div>
  );
}

function Alternates({
  pack,
  settings,
  onChange,
}: {
  pack: PackData;
  settings: Record<string, unknown>;
  onChange(change: UnlockChange): unknown;
}) {
  const id = useId();
  const [filter, setFilter] = useState("");
  // Boxes just ticked keep their new state until the edit has gone through.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  async function tick(recipe: string, unlocked: boolean) {
    setPending((current) => ({ ...current, [recipe]: unlocked }));
    try {
      await onChange({ recipe, unlocked });
    } finally {
      setPending(({ [recipe]: _done, ...rest }) => rest);
    }
  }
  const alternates = alternatesOf(pack);
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = alternates.filter((recipe) => words.every((word) => nameOf(recipe).toLowerCase().includes(word)));
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-t border-line-subtle px-4 pt-3.5 pb-5">
      <div className="flex items-baseline justify-between gap-3">
        <h4 id={id} className="text-2xs font-medium tracking-wide text-fg-faint uppercase">
          Alternate recipes
        </h4>
        <span className="text-xs text-fg-subtle tabular-nums">
          {unlockedCount(pack, settings)} of {alternates.length} unlocked
        </span>
      </div>
      <div className="flex gap-2">
        <Input
          size="sm"
          type="search"
          aria-label="Filter alternates"
          placeholder="Filter"
          className="flex-1"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <Button size="sm" variant="ghost" onClick={() => void onChange({ all: true })}>
          Unlock all
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void onChange({ all: false })}>
          Lock all
        </Button>
      </div>
      <ul aria-label="Alternates" className="flex flex-col">
        {shown.map((recipe) => {
          const unlocked = pending[recipe.id] ?? isUnlocked(settings, recipe.id);
          return (
            <li key={recipe.id}>
              <label className="flex min-h-7 cursor-pointer items-center gap-2.5 rounded-sm px-1 text-sm text-fg-muted hover:bg-surface-3 hover:text-fg">
                <input
                  type="checkbox"
                  className="size-3.5 accent-accent"
                  checked={unlocked}
                  onChange={(event) => void tick(recipe.id, event.target.checked)}
                />
                <span className="truncate">{nameOf(recipe).replace(/^Alternate: /, "")}</span>
              </label>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-1 text-sm text-fg-subtle">No alternate matches.</li>}
      </ul>
    </section>
  );
}

function failed(description: string) {
  toast({ tone: "error", title: "Couldn't change the save profile", ...(description ? { description } : {}) });
}
