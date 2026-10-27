// Writes JSON Schemas for pack authors from the zod contracts (the single source of truth).
// `pnpm schema` writes them; tools/schema.test.ts fails when the committed files are out of date.
import { writeFileSync } from "node:fs";
import { z } from "zod";
import { PackDataFile, PackManifest, StarterFile } from "../src/contracts/pack";
import { isMain } from "./is-main";

export const SCHEMAS = {
  "schemas/pack-manifest.schema.json": { schema: PackManifest, title: "Carbonara pack manifest (manifest.yaml)" },
  "schemas/pack-data.schema.json": { schema: PackDataFile, title: "Carbonara pack data file (data/*.yaml)" },
  "schemas/pack-starter.schema.json": { schema: StarterFile, title: "Carbonara starter factory (starters/*.yaml)" },
};

export function render(schema: z.ZodType, title: string): string {
  const json = { title, ...z.toJSONSchema(schema, { io: "input" }) };
  return `${JSON.stringify(json, null, 2)}\n`;
}

if (isMain(import.meta.url)) {
  for (const [file, { schema, title }] of Object.entries(SCHEMAS)) writeFileSync(file, render(schema, title));
}
