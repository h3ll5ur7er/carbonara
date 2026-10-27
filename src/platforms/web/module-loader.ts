// Runs an ES module from source text in the browser (window or worker), through a Blob URL.
import type { ModuleLoader } from "../../contracts/platform";

export const loadModule: ModuleLoader = async (source) => {
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  try {
    return await import(/* @vite-ignore */ url);
  } finally {
    URL.revokeObjectURL(url);
  }
};
