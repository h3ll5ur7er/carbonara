// Modal dialogs: focus moves in and stays there, Escape or the close button dismisses, focus returns on close.
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "./button";
import { cx } from "./cx";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export interface DialogContentProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons along the bottom edge, primary action last. */
  footer?: ReactNode;
  className?: string | undefined;
}

export function DialogContent({ title, description, children, footer, className }: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 grid animate-fade-in place-items-center overflow-y-auto bg-scrim p-6 backdrop-blur-scrim">
        <RadixDialog.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cx(
            "relative flex w-full max-w-110 animate-rise-in flex-col rounded-xl bg-surface-2 text-fg shadow-overlay",
            "focus-visible:outline-none",
            className,
          )}
        >
          <header className="flex items-start gap-3 px-5 pt-4.5 pb-1">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <RadixDialog.Title className="text-lg font-semibold tracking-tight">{title}</RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="text-sm text-fg-subtle">{description}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <IconButton label="Close" icon={<X />} size="sm" tooltip={false} className="-mt-0.5 -mr-2" />
            </RadixDialog.Close>
          </header>
          {children && <div className="px-5 py-3 text-sm text-fg-muted">{children}</div>}
          {footer && (
            <footer className="mt-2 flex justify-end gap-2 rounded-b-xl border-t border-line-subtle bg-surface-1 px-5 py-3">
              {footer}
            </footer>
          )}
        </RadixDialog.Content>
      </RadixDialog.Overlay>
    </RadixDialog.Portal>
  );
}
