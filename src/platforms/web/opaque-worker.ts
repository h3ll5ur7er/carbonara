// Starts a worker from module source with an opaque origin, for running third-party code. A worker made from a
// data: URL gets a fresh opaque origin: it can't open this origin's IndexedDB or caches, its requests aren't ours,
// and like every worker it has no DOM. Only its message port connects it to the worker that started it.
export function startOpaqueWorker(source: string, name: string): Worker {
  return new Worker(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`, { type: "module", name });
}
