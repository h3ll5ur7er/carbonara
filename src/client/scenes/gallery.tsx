// Scene `gallery`: every design-system primitive in its common states, under a switchable pack accent.
import {
  ClipboardPaste,
  Copy,
  Grid3x3,
  Maximize,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  Redo2,
  Scissors,
  Trash2,
  Undo2,
  ZoomIn,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button, IconButton } from "../ui/button";
import { cx } from "../ui/cx";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Kbd } from "../ui/kbd";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { NumberInput } from "../ui/number-input";
import { Select } from "../ui/select";
import { Slider } from "../ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { packAccentStyle } from "../ui/theme";
import { ThemeToggle } from "../ui/theme-toggle";
import { Switch, Toggle } from "../ui/toggle";

/** Accents as packs declare them (`theme.accent`). */
const accents = [
  { name: "Amber", value: "#f5a623" },
  { name: "Ember", value: "#f0743e" },
  { name: "Signal blue", value: "#5aa9ff" },
  { name: "Mint", value: "#3fd0a0" },
  { name: "Orchid", value: "#c58cff" },
];

const recipes = [
  { value: "iron-plate", label: "Iron Plate" },
  { value: "iron-plate-from-ore", label: "Iron Plate (Coal Smelting)" },
  { value: "iron-gear", label: "Iron Gear" },
  { value: "circuit", label: "Circuit" },
];

export default function Gallery() {
  const [accent, setAccent] = useState(accents[0]?.value);
  return (
    <div style={packAccentStyle(accent)} className="min-h-dvh bg-canvas font-sans text-fg">
      <header className="flex h-14 items-center gap-4 border-b border-line bg-surface-1 px-6">
        <div className="flex flex-col">
          <h1 className="text-base font-semibold tracking-tight">Primitives</h1>
          <p className="text-xs text-fg-subtle">Carbonara design system</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <AccentPicker value={accent} onChange={setAccent} />
          <div className="h-5 w-px bg-line" aria-hidden />
          <ThemeToggle />
        </div>
      </header>
      <main className="grid grid-cols-3 gap-4 p-6">
        <ButtonsCard />
        <ControlsCard />
        <FieldsCard />
        <RangeCard />
        <ChoiceCard />
        <OverlaysCard />
        <TokensCard />
      </main>
    </div>
  );
}

function AccentPicker({ value, onChange }: { value: string | undefined; onChange(accent: string): void }) {
  return (
    <div role="radiogroup" aria-label="Pack accent" className="flex items-center gap-1.5">
      {accents.map((accent) => {
        const checked = accent.value === value;
        return (
          <button
            key={accent.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={accent.name}
            onClick={() => onChange(accent.value)}
            style={packAccentStyle(accent.value)}
            className={cx(
              "grid size-6 place-items-center rounded-full transition-shadow",
              checked ? "ring-2 ring-accent" : "hover:ring-2 hover:ring-line-strong",
            )}
          >
            <span className="size-4 rounded-full bg-accent shadow-sm" />
          </button>
        );
      })}
    </div>
  );
}

function Card({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-4 rounded-xl bg-surface-1 p-5 shadow-panel">
      <header className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <p className="text-xs text-fg-subtle">{description}</p>
      </header>
      {children}
    </section>
  );
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

function Label({ htmlFor, id, children }: { htmlFor?: string; id?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} id={id} className="text-xs font-medium text-fg-muted">
      {children}
    </label>
  );
}

function ButtonsCard() {
  return (
    <Card title="Buttons" description="Primary for the one main action, secondary and ghost for the rest.">
      <Row>
        <Button variant="primary">
          <Play /> Solve
        </Button>
        <Button>
          <Plus /> Add node
        </Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="danger">
          <Trash2 /> Delete
        </Button>
      </Row>
      <Row>
        <Button variant="primary" size="sm">
          Accept
        </Button>
        <Button size="sm">Duplicate</Button>
        <Button variant="ghost" size="sm">
          Discard
        </Button>
        <Button size="sm" disabled>
          Disabled
        </Button>
      </Row>
    </Card>
  );
}

function ControlsCard() {
  const [panels, setPanels] = useState({ left: true, right: false, grid: true });
  return (
    <Card title="Icon buttons and toggles" description="Every icon carries a label; hover or focus shows it.">
      <Row className="gap-1">
        <IconButton label="Undo" shortcut={["Ctrl", "Z"]} icon={<Undo2 />} />
        <IconButton label="Redo" shortcut={["Ctrl", "Shift", "Z"]} icon={<Redo2 />} />
        <IconButton label="Zoom in" icon={<ZoomIn />} />
        <IconButton label="Zoom to fit" shortcut={["F"]} icon={<Maximize />} />
        <div className="mx-1.5 h-5 w-px bg-line" aria-hidden />
        <Toggle
          label="Library panel"
          pressed={panels.left}
          onPressedChange={(left) => setPanels({ ...panels, left })}
          icon={<PanelLeft />}
        />
        <Toggle
          label="Inspector panel"
          pressed={panels.right}
          onPressedChange={(right) => setPanels({ ...panels, right })}
          icon={<PanelRight />}
        />
        <Toggle
          label="Snap to grid"
          pressed={panels.grid}
          onPressedChange={(grid) => setPanels({ ...panels, grid })}
          icon={<Grid3x3 />}
        />
      </Row>
      <Row className="gap-3 text-xs text-fg-subtle">
        <span className="flex items-center gap-1.5">
          <Kbd keys={["Ctrl", "K"]} /> Command palette
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd keys={["Ctrl", "G"]} /> Collapse
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd keys={["?"]} /> Shortcuts
        </span>
      </Row>
    </Card>
  );
}

function FieldsCard() {
  const id = useId();
  const [machines, setMachines] = useState(4);
  return (
    <Card title="Inputs" description="Numbers are typed in tabular figures and nudged with the arrow keys.">
      <Input aria-label="Search" placeholder="Search items and recipes…" />
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2.5">
        <Label htmlFor={`${id}-machines`}>Machines</Label>
        <NumberInput
          id={`${id}-machines`}
          className="w-28"
          value={machines}
          min={0}
          max={1000}
          step={1}
          onValueChange={setMachines}
        />
        <Label htmlFor={`${id}-rate`}>Rate, disabled</Label>
        <NumberInput
          id={`${id}-rate`}
          className="w-28"
          value={37.5}
          min={0}
          max={1000}
          unit="/min"
          disabled
          onValueChange={() => undefined}
        />
      </div>
    </Card>
  );
}

function RangeCard() {
  const id = useId();
  const [clock, setClock] = useState(100);
  const [ratio, setRatio] = useState(0.25);
  return (
    <Card title="Slider and stepper" description="Drag for a rough value, type for an exact one.">
      <div className="flex flex-col gap-2">
        <Label id={`${id}-clock`}>Clock speed</Label>
        <div className="flex items-center gap-3">
          <Slider
            className="flex-1"
            aria-labelledby={`${id}-clock`}
            value={clock}
            min={1}
            max={250}
            step={1}
            onValueChange={setClock}
          />
          <NumberInput
            aria-labelledby={`${id}-clock`}
            className="w-26"
            value={clock}
            min={1}
            max={250}
            step={0.0001}
            unit="%"
            onValueChange={setClock}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label id={`${id}-ratio`}>Split ratio</Label>
        <div className="flex items-center gap-3">
          <Slider
            className="flex-1"
            aria-labelledby={`${id}-ratio`}
            value={ratio}
            min={0}
            max={1}
            step={0.01}
            onValueChange={setRatio}
          />
          <NumberInput
            aria-labelledby={`${id}-ratio`}
            className="w-26"
            size="sm"
            value={ratio}
            min={0}
            max={1}
            step={0.01}
            onValueChange={setRatio}
          />
        </div>
      </div>
    </Card>
  );
}

function ChoiceCard() {
  const id = useId();
  const [recipe, setRecipe] = useState("iron-plate");
  const [particles, setParticles] = useState(true);
  const [snap, setSnap] = useState(false);
  return (
    <Card title="Select, switches and tabs" description="Choices open with Space or Enter; arrows move between tabs.">
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2.5">
        <Label id={`${id}-recipe`}>Recipe</Label>
        <Select
          aria-labelledby={`${id}-recipe`}
          className="w-52"
          value={recipe}
          options={recipes}
          onValueChange={setRecipe}
        />
        <Label htmlFor={`${id}-particles`}>Flow particles</Label>
        <Switch id={`${id}-particles`} checked={particles} onCheckedChange={setParticles} />
        <Label htmlFor={`${id}-snap`}>Snap to grid</Label>
        <Switch id={`${id}-snap`} checked={snap} onCheckedChange={setSnap} />
        <Label htmlFor={`${id}-locked`}>Locked, disabled</Label>
        <Switch id={`${id}-locked`} checked disabled onCheckedChange={() => undefined} />
      </div>
      <Tabs defaultValue="inputs" className="flex flex-col gap-3">
        <TabsList aria-label="Node details" className="w-full">
          <TabsTrigger value="inputs">Inputs</TabsTrigger>
          <TabsTrigger value="outputs">Outputs</TabsTrigger>
          <TabsTrigger value="power">Power</TabsTrigger>
        </TabsList>
        <TabsContent value="inputs" className="text-xs text-fg-subtle">
          <Rate item="Clean Ferrite" rate="20" />
        </TabsContent>
        <TabsContent value="outputs" className="text-xs text-fg-subtle">
          <Rate item="Iron Plate" rate="20" />
        </TabsContent>
        <TabsContent value="power" className="text-xs text-fg-subtle">
          <Rate item="Furnace × 4" rate="2.0 MW" />
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function Rate({ item, rate }: { item: string; rate: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2 inset-ring inset-ring-line-subtle">
      <span className="text-fg-muted">{item}</span>
      <span className="font-mono text-fg">{rate}</span>
    </div>
  );
}

/** Swatches by group, named without their group prefix; class names are spelled out so Tailwind generates them. */
const swatches: { group: string; tokens: [name: string, className: string][] }[] = [
  {
    group: "Surfaces",
    tokens: [
      ["canvas", "bg-canvas"],
      ["1", "bg-surface-1"],
      ["2", "bg-surface-2"],
      ["3", "bg-surface-3"],
      ["4", "bg-surface-4"],
    ],
  },
  {
    group: "Text",
    tokens: [
      ["fg", "bg-fg"],
      ["muted", "bg-fg-muted"],
      ["subtle", "bg-fg-subtle"],
      ["faint", "bg-fg-faint"],
    ],
  },
  {
    group: "Accent",
    tokens: [
      ["accent", "bg-accent"],
      ["hover", "bg-accent-hover"],
      ["fg", "bg-accent-fg"],
      ["soft", "bg-accent-soft"],
    ],
  },
  {
    group: "Flows",
    tokens: [
      ["healthy", "bg-flow-healthy"],
      ["near", "bg-flow-near-capacity"],
      ["over", "bg-flow-over-capacity"],
    ],
  },
  {
    group: "Status",
    tokens: [
      ["success", "bg-success"],
      ["danger", "bg-danger"],
    ],
  },
];

function TokensCard() {
  return (
    <section
      aria-label="Tokens"
      className="col-span-3 flex justify-between gap-6 rounded-xl bg-surface-1 px-5 py-4 shadow-panel"
    >
      {swatches.map(({ group, tokens }) => (
        <div key={group} className="flex flex-col gap-2.5">
          <h2 className="text-2xs font-medium tracking-wide text-fg-faint uppercase">{group}</h2>
          <div className="flex gap-2">
            {tokens.map(([name, className]) => (
              <div key={name} className="flex w-14 flex-col gap-1.5">
                <span className={cx("h-8 rounded-md inset-ring inset-ring-line", className)} />
                <span className="truncate font-mono text-2xs text-fg-subtle">{name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function OverlaysCard() {
  const [alternates, setAlternates] = useState(true);
  return (
    <Card title="Menus, tooltips and dialogs" description="Overlays float on glass and close with Escape.">
      <Row>
        <Menu>
          <MenuTrigger asChild>
            <Button>Edit</Button>
          </MenuTrigger>
          <MenuContent>
            <MenuLabel>Clipboard</MenuLabel>
            <MenuItem icon={<Scissors />} shortcut={["Ctrl", "X"]}>
              Cut
            </MenuItem>
            <MenuItem icon={<Copy />} shortcut={["Ctrl", "C"]}>
              Copy
            </MenuItem>
            <MenuItem icon={<ClipboardPaste />} shortcut={["Ctrl", "V"]}>
              Paste
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Trash2 />} shortcut={["Del"]} disabled>
              Delete
            </MenuItem>
            <MenuSeparator />
            <MenuLabel>Show</MenuLabel>
            <MenuCheckboxItem checked={alternates} onCheckedChange={setAlternates}>
              Alternate recipes
            </MenuCheckboxItem>
          </MenuContent>
        </Menu>
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open dialog</Button>
          </DialogTrigger>
          <DialogContent
            title="Replace recipe everywhere?"
            description="12 nodes in this factory use Iron Plate."
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="primary">Replace</Button>
                </DialogClose>
              </>
            }
          >
            They will use Iron Plate (Coal Smelting) instead. You can undo this in one step.
          </DialogContent>
        </Dialog>
      </Row>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            tabIndex={0}
            aria-label="Context menu area"
            className="grid h-16 place-items-center rounded-lg border border-dashed border-line-strong text-xs text-fg-subtle select-none"
          >
            Right-click here, or press the context-menu key
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem icon={<Plus />} shortcut={["Ctrl", "K"]}>
            Add node…
          </ContextMenuItem>
          <ContextMenuItem icon={<ClipboardPaste />} shortcut={["Ctrl", "V"]}>
            Paste here
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem icon={<Maximize />} shortcut={["F"]}>
            Zoom to fit
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </Card>
  );
}
