// How an issue reads to a person: the same text in the app, the pack CLI and MCP.
import type { Issue } from "../contracts/issues";

/** `data/recipes.yaml:14:22: recipes[3].in.coal: Unknown item 'coal'` */
export function describeIssue({ path, message, line, column }: Issue): string {
  if (line === undefined) return [joinPath(path), message].filter(Boolean).join(": ");
  const [file, ...rest] = path;
  return [`${file}:${line}:${column ?? 1}`, joinPath(rest), message].filter(Boolean).join(": ");
}

function joinPath(path: Issue["path"]): string {
  return path.map((key, index) => (typeof key === "number" ? `[${key}]` : index === 0 ? key : `.${key}`)).join("");
}
