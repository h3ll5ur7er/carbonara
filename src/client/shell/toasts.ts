// Short-lived messages about what just happened ("Added Iron Plate", "Couldn't apply the edit").
// Anything in the client may call `toast`; the `Toaster` in the shell shows them.
import { create } from "zustand";

export type ToastTone = "info" | "success" | "error";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
}

export interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

/** More would cover the canvas; older ones make room. */
export const maxToasts = 3;

let nextId = 1;

export const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));

/** Shows a toast and returns its id. */
export function toast({ tone = "info", ...input }: ToastInput): number {
  const id = nextId++;
  useToasts.setState(({ toasts }) => ({ toasts: [...toasts, { id, tone, ...input }].slice(-maxToasts) }));
  return id;
}

/** A failed call's message, for a toast's description. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function dismissToast(id: number): void {
  useToasts.setState(({ toasts }) => ({ toasts: toasts.filter((shown) => shown.id !== id) }));
}
