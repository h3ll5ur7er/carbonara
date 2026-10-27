// A single-thumb slider. `onValueChange` follows the drag; `onValueCommit` fires once when it ends.
import * as RadixSlider from "@radix-ui/react-slider";
import { cx } from "./cx";

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number | undefined;
  onValueChange(value: number): void;
  onValueCommit?: ((value: number) => void) | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
  "aria-label"?: string | undefined;
  "aria-labelledby"?: string | undefined;
  "aria-valuetext"?: string | undefined;
}

export function Slider({
  value,
  min,
  max,
  step,
  onValueChange,
  onValueCommit,
  disabled,
  className,
  ...aria
}: SliderProps) {
  return (
    <RadixSlider.Root
      value={[value]}
      min={min}
      max={max}
      {...(step === undefined ? {} : { step })}
      {...(disabled === undefined ? {} : { disabled })}
      onValueChange={([next]) => next !== undefined && onValueChange(next)}
      onValueCommit={([next]) => next !== undefined && onValueCommit?.(next)}
      className={cx(
        "group/slider relative flex h-5 touch-none items-center select-none data-disabled:opacity-45",
        className,
      )}
    >
      <RadixSlider.Track className="relative h-1 grow overflow-hidden rounded-full bg-surface-4 inset-ring inset-ring-line-subtle">
        <RadixSlider.Range className="absolute h-full rounded-full bg-accent" />
      </RadixSlider.Track>
      <RadixSlider.Thumb
        {...aria}
        className={cx(
          "block size-3.5 rounded-full bg-knob shadow-knob inset-ring-2 inset-ring-accent",
          "transition-[box-shadow,scale] hover:ring-4 hover:ring-accent-soft active:scale-110",
          "focus-visible:ring-4 focus-visible:ring-accent-glow focus-visible:outline-none",
        )}
      />
    </RadixSlider.Root>
  );
}
