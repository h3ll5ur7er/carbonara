// One text file of a pack (YAML or JSON), parsed so that issues about its value can name a line and column.
import { isMap, isSeq, LineCounter, parseDocument, type Node } from "yaml";
import type { z } from "zod";
import type { Issue } from "../../contracts/issues";
import { fail, ok, type Result } from "../../contracts/result";

export interface Source {
  name: string;
  value: unknown;
  /** An issue at `path` inside this file, with the line and column of the closest node that exists. */
  issue(path: Issue["path"], message: string): Issue;
}

/** JSON is YAML too, so one parser locates problems in both. */
export function parseSource(name: string, bytes: Uint8Array): Result<Source> {
  const lineCounter = new LineCounter();
  const document = parseDocument(new TextDecoder().decode(bytes), { lineCounter, prettyErrors: false });
  const position = (offset: number) => {
    const { line, col } = lineCounter.linePos(offset);
    return { line, column: col };
  };
  if (document.errors.length > 0) {
    return fail(document.errors.map((error) => ({ path: [name], message: error.message, ...position(error.pos[0]) })));
  }
  return ok({
    name,
    value: document.toJS() ?? {},
    issue: (path, message) => ({ path: [name, ...path], message, ...position(offsetOf(document.contents, path)) }),
  });
}

/** Validates a source against a schema; zod's issues become located issues. */
export function validate<S extends z.ZodType>(source: Source, schema: S): Result<z.output<S>> {
  const parsed = schema.safeParse(source.value, { error: readableMessage });
  if (parsed.success) return ok(parsed.data);
  return fail(
    parsed.error.issues.map((issue) =>
      source.issue(
        issue.path.filter((key) => typeof key !== "symbol"),
        issue.message,
      ),
    ),
  );
}

/** Messages for the mistakes authors make most; zod's own message for everything else. */
function readableMessage(issue: z.core.$ZodRawIssue): string | undefined {
  if (issue.code !== "invalid_type") return undefined;
  if (issue.input === undefined) return "Required";
  // `version: 1.0` is a number to YAML.
  if (issue.expected === "string" && typeof issue.input === "number") {
    return `Expected text, not the number ${issue.input}; write it in quotes`;
  }
  return undefined;
}

/**
 * Where the value at `path` starts. A map entry is located at its key, which is the line an author looks for;
 * when the path leads to something that isn't there (a missing field), at the closest node that is.
 */
function offsetOf(root: Node | null, path: Issue["path"]): number {
  let node = root;
  let offset = root?.range?.[0] ?? 0;
  for (const [index, key] of path.entries()) {
    if (isMap(node)) {
      const pair = node.items.find((item) => String((item.key as { value?: unknown } | null)?.value) === String(key));
      if (!pair) break;
      const located = index === path.length - 1 ? (pair.key as Node | null) : (pair.value as Node | null);
      offset = located?.range?.[0] ?? offset;
      node = pair.value as Node | null;
    } else if (isSeq(node) && typeof key === "number" && node.items[key]) {
      node = node.items[key] as Node;
      offset = node.range?.[0] ?? offset;
    } else break;
  }
  return offset;
}
