// The welcome tour on screen: a card at the top of the canvas that says what to do next, and a spotlight on the
// part of the app the step is about. Steps that ask for something move on by themselves once it's done (the live
// app watches the factory, use-onboarding.ts); the card's buttons move on, and close the tour, from the keyboard.
import { ArrowRight, Check, GraduationCap, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { formatShortcut, platformOf } from "../../core/commands-shortcuts";
import { appRegistry } from "../../shell/app-commands";
import { Button, IconButton } from "../../ui/button";
import { cx } from "../../ui/cx";
import { Kbd } from "../../ui/kbd";
import { paletteCommandId } from "../command-palette/command-palette";
import { COUNTED_STEPS, TOUR_STEPS, type TourStepId } from "./tour";
import { currentStep, finishTour, nextStep, skipTour, useTour } from "./tour-store";
import "./onboarding.css";

const platform = platformOf(navigator.platform);

function Keys({ command }: { command: string }) {
  const shortcut = appRegistry.get(command)?.shortcut;
  return shortcut ? <Kbd keys={formatShortcut(shortcut, platform)} className="mx-0.5 align-[-0.15em]" /> : null;
}

interface StepContent {
  title: string;
  body: ReactNode;
  /** What the spotlight rings (a CSS selector); nothing when left out. */
  spotlight?: string;
  /** Whether the step waits for the person to do something (then "Next" only skips ahead). */
  action?: boolean;
}

const STEPS: Record<TourStepId, StepContent> = {
  welcome: {
    title: "Welcome to your first factory",
    body: (
      <>
        Machines on the left feed machines on the right, and the flows between them carry the items. In five short steps
        you’ll extend this factory, watch it solve and let Carbonara plan the rest.
      </>
    ),
  },
  add: {
    title: "Add a recipe",
    body: (
      <>
        Press <Keys command={paletteCommandId} /> or click the search field, and type what you want to make — the note
        on the canvas suggests something. Enter adds it.
      </>
    ),
    spotlight: '[data-tour="palette"]',
    action: true,
  },
  connect: {
    title: "Connect it through its ports",
    body: (
      <>
        Drag from an output port on a machine’s right edge to an input port on the left of the next one. Connect the new
        machine on both sides. Letting go on empty canvas offers what fits there.
      </>
    ),
    action: true,
  },
  target: {
    title: "Set a target",
    body: (
      <>
        Select the output at the end of the line, then type a rate into <em className="text-fg not-italic">Target</em>{" "}
        in the inspector and press Enter.
      </>
    ),
    spotlight: 'aside[aria-label="Inspector"]',
    action: true,
  },
  solve: {
    title: "Watch it solve",
    body: (
      <>
        Carbonara solved the whole factory as you typed: machine counts on every node, rates on every flow, and
        shortfalls in red. Change the target and everything follows.
      </>
    ),
  },
  plan: {
    title: "Let Carbonara plan",
    body: (
      <>
        Press <Keys command="plan.production" />, name an item and a rate, and the planner proposes the whole production
        line as a ghost to accept, adjust or discard.
      </>
    ),
    action: true,
  },
  done: {
    title: "You’re all set",
    body: (
      <>
        <Keys command={paletteCommandId} /> finds every command, this tour included: “Take the tour”.{" "}
        <Keys command="help.shortcuts" /> shows all the shortcuts. Happy building!
      </>
    ),
  },
};

export function TourCard() {
  const running = useTour((state) => state.running);
  const index = useTour(currentStep);
  if (!running) return null;
  const id = TOUR_STEPS[index] ?? "welcome";
  return (
    <>
      {STEPS[id].spotlight && <Spotlight selector={STEPS[id].spotlight} />}
      <Card key={id} id={id} index={index} />
    </>
  );
}

function Card({ id, index }: { id: TourStepId; index: number }) {
  const step = STEPS[id];
  const titleId = useId();
  const primary = useRef<HTMLButtonElement>(null);
  const focusCard = useTour((state) => state.focusCard);
  useEffect(() => {
    if (!focusCard) return;
    primary.current?.focus();
    useTour.setState({ focusCard: false });
  }, [focusCard]);

  const counted = index > 0 && index <= COUNTED_STEPS;
  const first = id === "welcome";
  const last = id === "done";
  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-tour-step={id}
      className={cx(
        "fixed top-16 left-1/2 z-30 flex w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2 animate-rise-in flex-col",
        "rounded-xl bg-glass shadow-overlay backdrop-blur-glass backdrop-saturate-150",
      )}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line-subtle pr-1.5 pl-4">
        <GraduationCap className="size-3.5 text-accent-fg" aria-hidden />
        <span className="flex-1 truncate text-xs font-semibold tracking-wide text-fg-muted uppercase">
          Tour
          {counted && (
            <span className="font-normal text-fg-subtle normal-case">{` · Step ${index} of ${COUNTED_STEPS}`}</span>
          )}
        </span>
        {!last && <IconButton label="Close the tour" icon={<X />} size="sm" tooltip={false} onClick={skipTour} />}
      </header>
      {/* Steps that move on by themselves are announced. */}
      <div aria-live="polite" className="flex flex-col gap-1.5 px-4 pt-3.5 pb-1">
        <h2 id={titleId} className="text-base font-semibold tracking-tight text-fg">
          {step.title}
        </h2>
        <p className="text-sm text-fg-muted">{step.body}</p>
      </div>
      <footer className="flex items-center gap-2 px-4 pt-3 pb-3.5">
        {counted ? <Progress index={index} /> : <span className="flex-1" />}
        {first && (
          <Button variant="ghost" size="sm" onClick={skipTour}>
            Skip tour
          </Button>
        )}
        {step.action && (
          <span className="mr-1 flex items-center gap-1.5 text-xs text-fg-subtle">
            <span className="size-1.5 rounded-full bg-accent motion-safe:animate-pulse" aria-hidden />
            Waiting for you
          </span>
        )}
        <Button
          ref={primary}
          variant={step.action ? "ghost" : "primary"}
          size="sm"
          onClick={() => (last ? finishTour() : nextStep(true))}
        >
          {last ? <Check aria-hidden /> : null}
          {first ? "Start the tour" : last ? "Finish" : step.action ? "Skip step" : "Next"}
          {!last && !step.action ? <ArrowRight aria-hidden /> : null}
        </Button>
      </footer>
    </section>
  );
}

function Progress({ index }: { index: number }) {
  return (
    <span className="flex flex-1 items-center gap-1" aria-hidden>
      {Array.from({ length: COUNTED_STEPS }, (_, dot) => (
        <span
          key={dot}
          className={cx(
            "h-1.5 rounded-full transition-[width,background-color]",
            dot + 1 === index ? "w-4 bg-accent" : "w-1.5",
            dot + 1 < index ? "bg-accent-fg/60" : dot + 1 > index && "bg-fg-faint/50",
          )}
        />
      ))}
    </span>
  );
}

/** An accent ring around the element the selector finds, following it as panels open, close and resize. */
function Spotlight({ selector }: { selector: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    const measure = () => {
      const found = document.querySelector(selector)?.getBoundingClientRect() ?? null;
      setRect((previous) => (sameRect(previous, found) ? previous : found));
    };
    measure();
    // Panels open, close and resize without telling anyone; a light poll keeps up with them.
    const timer = setInterval(measure, 250);
    window.addEventListener("resize", measure);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [selector]);
  if (!rect) return null;
  const pad = 4;
  return (
    <div
      aria-hidden
      className="tour-spotlight pointer-events-none fixed z-30 rounded-xl"
      style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + 2 * pad, height: rect.height + 2 * pad }}
    />
  );
}

function sameRect(a: DOMRect | null, b: DOMRect | null): boolean {
  if (!a || !b) return a === b;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}
