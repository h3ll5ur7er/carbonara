import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { render, SCHEMAS } from "./schema";

describe("committed JSON Schemas", () => {
  it.each(Object.entries(SCHEMAS))("%s is up to date (run `pnpm schema`)", (file, { schema, title }) => {
    expect(readFileSync(file, "utf8")).toBe(render(schema, title));
  });
});
