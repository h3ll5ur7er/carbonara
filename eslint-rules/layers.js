// Enforces the layer table and call rules from docs/Architecture.md.
import path from "node:path";

/** Which layers each layer may import. `self` means: only its own component (no sideways calls). */
const ALLOWED = {
  contracts: ["contracts"],
  utilities: ["contracts", "utilities"],
  engines: ["contracts", "utilities", "self"],
  access: ["contracts", "utilities", "self"],
  platforms: ["contracts", "utilities", "self"],
  managers: ["contracts", "utilities", "engines", "access", "self"],
  client: ["contracts", "utilities", "client"],
  shells: ["contracts", "utilities", "engines", "access", "platforms", "managers", "client", "shells"],
};

/** Packages that only the user interface may use. */
const UI_MODULES = ["react", "react-dom", "@xyflow/react", "zustand"];
const UI_LAYERS = ["client", "shells"];

/** `{ layer, component }` of a file below a `src/` folder, or null outside of it. */
function locate(file) {
  const parts = path.normalize(file).split(path.sep);
  const src = parts.lastIndexOf("src");
  if (src < 0 || !(parts[src + 1] in ALLOWED)) return null;
  const layer = parts[src + 1];
  // `editing.test.ts` belongs to the component `editing`.
  const component = (parts[src + 2] ?? "").replace(/\..*$/, "");
  return { layer, component };
}

function isUiModule(source) {
  return UI_MODULES.some((name) => source === name || source.startsWith(`${name}/`));
}

/** @type {import("eslint").Rule.RuleModule} */
export const layers = {
  meta: {
    type: "problem",
    docs: { description: "Calls only go down the layers of docs/Architecture.md, never sideways" },
    messages: {
      layer: "{{from}} may not import {{to}} (see docs/Architecture.md, Layers).",
      uiModule: "Only the client and the shells may use '{{source}}'.",
    },
    schema: [],
  },
  create(context) {
    const from = locate(context.filename);
    if (!from) return {};

    function check(node) {
      const source = node.source?.value;
      if (typeof source !== "string") return;
      if (!source.startsWith(".")) {
        if (isUiModule(source) && !UI_LAYERS.includes(from.layer)) {
          context.report({ node, messageId: "uiModule", data: { source } });
        }
        return;
      }
      const to = locate(path.resolve(path.dirname(context.filename), source));
      if (!to) return;
      const allowed = ALLOWED[from.layer];
      const ok =
        allowed.includes(to.layer) ||
        (allowed.includes("self") && to.layer === from.layer && to.component === from.component);
      if (!ok) {
        context.report({
          node,
          messageId: "layer",
          data: { from: `${from.layer}/${from.component}`, to: `${to.layer}/${to.component}` },
        });
      }
    }

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};

export default { rules: { layers } };
