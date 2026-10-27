// Shows the toasts at the bottom centre, above the canvas and clear of the side panels.
// Screen readers announce them; F8 moves focus to them; they close by timeout, swipe, Escape or the button.
import * as RadixToast from "@radix-ui/react-toast";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cx } from "../ui/cx";
import { dismissToast, useToasts, type ToastTone } from "./toasts";

const icons: Record<ToastTone, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: "text-accent-fg" },
  success: { icon: CircleCheck, className: "text-success" },
  error: { icon: CircleAlert, className: "text-danger" },
};

/** Errors stay longer: they usually need reading. */
const durationMs: Record<ToastTone, number> = { info: 4000, success: 4000, error: 8000 };

export function Toaster() {
  const toasts = useToasts((state) => state.toasts);
  return (
    <RadixToast.Provider swipeDirection="down" label="Notifications">
      {toasts.map(({ id, title, description, tone }) => {
        const { icon: Icon, className } = icons[tone];
        return (
          <RadixToast.Root
            key={id}
            type={tone === "error" ? "foreground" : "background"}
            duration={durationMs[tone]}
            onOpenChange={(open) => open || dismissToast(id)}
            className={cx(
              "pointer-events-auto flex w-full items-start gap-3 rounded-lg bg-glass py-3 pr-2 pl-3.5 shadow-overlay",
              "backdrop-blur-glass backdrop-saturate-150 animate-rise-in",
              "data-[swipe=move]:translate-y-(--radix-toast-swipe-move-y) data-[swipe=end]:animate-fade-out",
            )}
          >
            <Icon className={cx("mt-0.5 size-4 shrink-0", className)} aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <RadixToast.Title className="text-sm font-medium text-fg">{title}</RadixToast.Title>
              {description && (
                <RadixToast.Description className="text-xs text-fg-subtle">{description}</RadixToast.Description>
              )}
            </div>
            <RadixToast.Close
              aria-label="Dismiss"
              className="grid size-6 shrink-0 place-items-center rounded-sm text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
            >
              <X className="size-3.5" />
            </RadixToast.Close>
          </RadixToast.Root>
        );
      })}
      <RadixToast.Viewport className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex w-90 max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-2 outline-none" />
    </RadixToast.Provider>
  );
}
