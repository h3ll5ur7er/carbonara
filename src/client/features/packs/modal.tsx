// A modal panel on the native <dialog>, which brings focus trapping, Escape and the top layer for free.
// Local to the packs feature until the design system has its dialog primitive (CARB-21).
import { useEffect, useId, useRef, type ReactNode } from "react";

export function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto w-120 max-w-full rounded-xl bg-surface-2 text-fg shadow-overlay backdrop:bg-canvas/70 backdrop:backdrop-blur-glass"
    >
      <div className="flex flex-col gap-4 p-5">
        <header className="flex flex-col gap-1">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          {description && <p className="text-sm text-fg-muted">{description}</p>}
        </header>
        {children}
      </div>
    </dialog>
  );
}

const buttonBase =
  "inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";

export const buttonStyles = {
  primary: `${buttonBase} bg-accent text-on-accent shadow-sm hover:bg-accent-hover`,
  secondary: `${buttonBase} bg-surface-3 text-fg hover:bg-surface-4`,
  quiet: `${buttonBase} text-fg-muted hover:bg-surface-3 hover:text-fg`,
};
