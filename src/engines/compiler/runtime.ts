// The compile step with a plugin called right here, in this worker: how built-in (trusted) packs run. Third-party
// packs run the same functions in the plugin sandbox instead; both answer through the `PluginRuntime` contract.
import type { LoadedPack, PluginRuntime } from "../../contracts/access";
import type { PackData } from "../../contracts/pack";
import type { Plugin } from "../../contracts/plugin";
import { compile } from "./compile";
import { describePlugin } from "./hooks";
import { findBlueprint } from "./instances";
import { toResults } from "./results";

export function localRuntime(pack: PackData, plugin: Plugin): PluginRuntime {
  return {
    async compile(document) {
      const compiled = compile({ document, pack, plugin });
      return {
        model: compiled.model,
        results: async (outcome, version) => toResults(compiled, outcome, plugin, version),
        blueprints: Object.fromEntries((compiled.blueprints ?? []).map(({ graph }, index) => [graph, index])),
        async blueprintResults(graph, outcome, version) {
          const blueprint = findBlueprint(compiled, graph);
          if (!blueprint) throw new Error(`Unknown blueprint ${graph}`);
          return toResults(blueprint.compiled, outcome, plugin, version);
        },
      };
    },
    describe: async (settings) => describePlugin(pack, plugin, settings),
  };
}

/** Where a loaded pack's plugin runs: isolated for third-party packs, right here for built-in ones. */
export function runtimeOf(pack: LoadedPack): PluginRuntime {
  if (pack.isolated) return pack.isolated;
  return localRuntime(pack.data, pack.plugin);
}
