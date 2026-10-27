// Turns the files of a pack (from a .cpack archive or an unpacked folder) into a validated manifest and data.
// Pure: callers read the files; this decides whether they make a valid pack, and says where it doesn't.
import type { Issue } from "../../contracts/issues";
import { PackData, PackDataFile, PackManifest } from "../../contracts/pack";
import { fail, ok, type Result } from "../../contracts/result";
import { PACK_FORMAT, supportsRange } from "./format";
import { checkReferences } from "./references";
import { parseSource, validate, type Source } from "./source";

export interface PackContents {
  manifest: PackManifest;
  data: PackData;
}

const MANIFEST = "manifest.yaml";
const DATA_FILE = /\.(ya?ml|json)$/;
const SECTIONS = Object.keys(PackDataFile.shape);

type Section = Exclude<keyof PackDataFile, "units">;
/** Which file, and which entry in it, each merged entry came from, so reference issues can point there. */
type Origins = Record<Section, { file: Source; index: number }[]>;

/** The manifest's shape only: enough to show which pack this is, even when the rest of it is broken. */
export function readManifest(files: Record<string, Uint8Array>): Result<PackManifest> {
  const manifest = parseManifest(files);
  return manifest.ok ? ok(manifest.value.manifest) : manifest;
}

export function readPackFiles(files: Record<string, Uint8Array>): Result<PackContents> {
  const parsed = parseManifest(files);
  if (!parsed.ok) return parsed;
  const { manifest, source } = parsed.value;
  if (!supportsRange(manifest.engine, PACK_FORMAT)) {
    const message = `Needs pack format ${manifest.engine}, but this version of Carbonara reads pack format ${PACK_FORMAT}`;
    return fail([source.issue(["engine"], message)]);
  }
  if (!files[manifest.plugin]) return fail([source.issue(["plugin"], `${manifest.plugin} is missing from the pack`)]);

  const folder = manifest.data.endsWith("/") ? manifest.data : `${manifest.data}/`;
  const dataFiles = Object.keys(files)
    .filter((name) => name.startsWith(folder) && DATA_FILE.test(name))
    .sort();

  const issues: Issue[] = [];
  const merged: Required<Pick<PackDataFile, Section>> = {
    items: [],
    buildings: [],
    recipes: [],
    logistics: [],
    resources: [],
  };
  const origins: Origins = { items: [], buildings: [], recipes: [], logistics: [], resources: [] };
  let units: { value: PackDataFile["units"]; file: string } | undefined;

  for (const name of dataFiles) {
    const file = readDataFile(name, files[name] as Uint8Array);
    if (!file.ok) {
      issues.push(...file.error);
      continue;
    }
    const { source, data } = file.value;
    const { units: fileUnits, ...sections } = data;
    if (fileUnits) {
      if (units) issues.push(source.issue(["units"], `Units are already defined in ${units.file}`));
      else units = { value: fileUnits, file: name };
    }
    for (const [section, entries] of Object.entries(sections) as [Section, unknown[]][]) {
      (merged[section] as unknown[]).push(...entries);
      origins[section].push(...entries.map((_, index) => ({ file: source, index })));
    }
  }
  if (issues.length > 0) return fail(issues);

  const data = PackData.parse({ ...merged, ...(units && { units: units.value }) });
  const referenceIssues = checkReferences(data);
  if (referenceIssues.length > 0) return fail(referenceIssues.map((issue) => locate(issue, origins)));
  return ok({ manifest, data });
}

function parseManifest(files: Record<string, Uint8Array>): Result<{ manifest: PackManifest; source: Source }> {
  const bytes = files[MANIFEST];
  if (!bytes) return fail([{ path: [MANIFEST], message: "Missing file" }]);
  const source = parseSource(MANIFEST, bytes);
  if (!source.ok) return source;
  const manifest = validate(source.value, PackManifest);
  return manifest.ok ? ok({ manifest: manifest.value, source: source.value }) : manifest;
}

function readDataFile(name: string, bytes: Uint8Array): Result<{ source: Source; data: PackDataFile }> {
  const source = parseSource(name, bytes);
  if (!source.ok) return source;
  const { value } = source.value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const unknown = Object.keys(value).filter((key) => !SECTIONS.includes(key));
    const expected = `${SECTIONS.slice(0, -1).join(", ")} or ${SECTIONS.at(-1)}`;
    if (unknown.length > 0) {
      return fail(unknown.map((key) => source.value.issue([key], `Unknown section; use ${expected}`)));
    }
  }
  const data = validate(source.value, PackDataFile);
  return data.ok ? ok({ source: source.value, data: data.value }) : data;
}

/** Turns an issue about the merged data (`recipes[12]…`) into one about the file and entry it came from. */
function locate(issue: Issue, origins: Origins): Issue {
  const [section, index, ...rest] = issue.path;
  const origin = origins[section as Section]?.[index as number];
  return origin ? origin.file.issue([section as Section, origin.index, ...rest], issue.message) : issue;
}
