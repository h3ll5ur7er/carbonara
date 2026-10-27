// The ids and units that packs and documents share. Apart from both, so that pack.ts can use the document's
// shapes (a pack's starter factories are documents) without the two importing each other.
import { z } from "zod";

/** Ids of items, buildings, recipes …: lowercase, may carry a variant after `@` (`steam@500`, `gear@rare`). */
export const Id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]*(@[a-z0-9._-]+)?$/, "lowercase letters, digits, . _ - and an optional @variant");
export type Id = z.infer<typeof Id>;

export const RateUnit = z.enum(["per_second", "per_minute", "per_hour"]);
export type RateUnit = z.infer<typeof RateUnit>;
