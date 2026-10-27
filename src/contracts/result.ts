import type { Issue } from "./issues";

/** The outcome of something that can fail in an expected way. Matches the RPC envelope. */
export type Result<T, E = Issue[]> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const fail = <E>(error: E): Result<never, E> => ({ ok: false, error });
