// Turns the files of a pack (from a .cpack archive or an unpacked folder) into a validated manifest and data.
// Pure: callers read the files; this decides whether they make a valid pack.
import { parse } from "yaml";
import type { z } from "zod";
import type { Issue } from "../../contracts/issues";
import { PackData, PackDataFile, PackManifest } from "../../contracts/pack";
import { fail, ok, type Result } from "../../contracts/result";
import { checkReferences } from "./references";

export interface PackContents {
  manifest: PackManifest;
  data: PackData;
}

const MANIFEST = "manifest.yaml";
const DATA_FILE = /\.(ya?ml|json)$/;

export function readPackFiles(files: Record<string, Uint8Array>): Result<PackContents> {
  const manifestBytes = files[MANIFEST];
  if (!manifestBytes) return fail([{ path: [MANIFEST], message: "Missing file" }]);
  const manifest = parseFile(MANIFEST, manifestBytes, PackManifest);
  if (!manifest.ok) return manifest;
  if (!files[manifest.value.plugin]) return fail([{ path: [manifest.value.plugin], message: "Missing file" }]);

  const folder = manifest.value.data.endsWith("/") ? manifest.value.data : `${manifest.value.data}/`;
  const dataFiles = Object.keys(files)
    .filter((name) => name.startsWith(folder) && DATA_FILE.test(name))
    .sort();

  const issues: Issue[] = [];
  const merged: Required<Omit<PackDataFile, "units">> = {
    items: [],
    buildings: [],
    recipes: [],
    logistics: [],
    resources: [],
  };
  let units: { value: PackDataFile["units"]; file: string } | undefined;

  for (const name of dataFiles) {
    const file = parseFile(name, files[name] as Uint8Array, PackDataFile);
    if (!file.ok) {
      issues.push(...file.error);
      continue;
    }
    const { units: fileUnits, ...sections } = file.value;
    if (fileUnits) {
      if (units) issues.push({ path: [name, "units"], message: `Units are already defined in ${units.file}` });
      else units = { value: fileUnits, file: name };
    }
    for (const [section, entries] of Object.entries(sections) as [keyof typeof merged, unknown[]][]) {
      (merged[section] as unknown[]).push(...entries);
    }
  }
  if (issues.length > 0) return fail(issues);

  const data = PackData.parse({ ...merged, ...(units && { units: units.value }) });
  const referenceIssues = checkReferences(data);
  if (referenceIssues.length > 0) return fail(referenceIssues);
  return ok({ manifest: manifest.value, data });
}

function parseFile<S extends z.ZodType>(name: string, bytes: Uint8Array, schema: S): Result<z.output<S>> {
  let raw: unknown;
  try {
    const text = new TextDecoder().decode(bytes);
    raw = name.endsWith(".json") ? JSON.parse(text) : parse(text);
  } catch (error) {
    return fail([{ path: [name], message: error instanceof Error ? error.message : String(error) }]);
  }
  const parsed = schema.safeParse(raw ?? {});
  if (parsed.success) return ok(parsed.data);
  return fail(
    parsed.error.issues.map((issue) => ({
      path: [name, ...issue.path.filter((key) => typeof key !== "symbol")],
      message: issue.message,
    })),
  );
}
