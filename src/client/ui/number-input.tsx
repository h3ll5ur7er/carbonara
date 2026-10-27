// A number field with a unit and a stepper: type a value, or nudge it with the arrow keys or the buttons.
// Only committed values leave the field (Enter, blur, a nudge), so every edit is one undo step.
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";
import { fieldSurface } from "./input";
import { commitNumber, formatNumber, numberKeyAction, stepNumber, type NumberRange } from "./number";

export interface NumberInputProps extends NumberRange {
  value: number;
  onValueChange(value: number): void;
  unit?: string | undefined;
  size?: "sm" | "md";
  disabled?: boolean | undefined;
  id?: string | undefined;
  className?: string | undefined;
  "aria-label"?: string | undefined;
  "aria-labelledby"?: string | undefined;
}

export function NumberInput({
  value,
  onValueChange,
  min,
  max,
  step,
  unit,
  size = "md",
  disabled,
  id,
  className,
  ...aria
}: NumberInputProps) {
  const range: NumberRange = step === undefined ? { min, max } : { min, max, step };
  // The text being typed; null while the field shows the value.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = formatNumber(value, step);

  function emit(next: number) {
    setDraft(null);
    if (next !== value) onValueChange(next);
  }

  function commit() {
    if (draft === null) return;
    const next = commitNumber(draft, range);
    if (next === null) setDraft(null);
    else emit(next);
  }

  function nudge(direction: 1 | -1, large: boolean) {
    const from = draft === null ? value : (commitNumber(draft, range) ?? value);
    emit(stepNumber(from, direction, range, large));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const action = numberKeyAction(event.nativeEvent);
    if (!action) return;
    event.preventDefault();
    if (action.type === "step") nudge(action.direction, action.large);
    else if (action.type === "commit") commit();
    else setDraft(null);
  }

  return (
    <div
      className={cx(
        fieldSurface,
        "group/number flex min-w-0 items-stretch overflow-hidden",
        size === "sm" ? "h-7 text-xs" : "h-8",
        className,
      )}
    >
      <input
        id={id}
        type="text"
        inputMode="decimal"
        role="spinbutton"
        autoComplete="off"
        spellCheck={false}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={unit ? `${shown} ${unit}` : shown}
        disabled={disabled}
        value={draft ?? shown}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 bg-transparent pl-2.5 text-right font-mono tabular-nums outline-none"
        {...aria}
      />
      {unit && (
        <span className="flex items-center pl-1 font-mono text-fg-subtle select-none" aria-hidden>
          {unit}
        </span>
      )}
      <div className="ml-1.5 flex w-5 shrink-0 flex-col border-l border-line-subtle text-fg-muted">
        <StepButton label="Increase" disabled={disabled || value >= max} onStep={() => nudge(1, false)}>
          <ChevronUp />
        </StepButton>
        <StepButton label="Decrease" disabled={disabled || value <= min} onStep={() => nudge(-1, false)}>
          <ChevronDown />
        </StepButton>
      </div>
    </div>
  );
}

/** Pointer-only: the field's arrow keys do the same, so the buttons stay out of the tab order. */
function StepButton({
  label,
  disabled,
  onStep,
  children,
}: {
  label: string;
  disabled: boolean | undefined;
  onStep(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      disabled={disabled}
      // Keeps the focus (and a draft being typed) in the field.
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => onStep()}
      className={cx(
        "grid flex-1 place-items-center transition-colors hover:bg-surface-3 hover:text-fg active:bg-surface-4",
        "disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3",
      )}
    >
      {children}
    </button>
  );
}
