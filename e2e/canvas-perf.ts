// The canvas perf harness: pans a scene through React Flow's real input path (a middle-button drag, handled
// by d3-zoom) once per animation frame, and records the frame intervals and the main thread's CPU time.
// CPU time per frame is the stable measure: frame intervals also count whatever else the machine is doing.
import type { Page } from "@playwright/test";

export interface PanStats {
  frames: number;
  /** Mean frames per second over the run. */
  fps: number;
  /** Frame intervals, in milliseconds. */
  median: number;
  p95: number;
  /** Main-thread CPU time per frame (script, style, layout, paint), in milliseconds: under 16.7 holds 60 fps. */
  cpuPerFrame: number;
  /** How far the viewport moved, to prove the pan happened. */
  pannedPixels: number;
}

export async function measurePan(page: Page, frames = 180, pixelsPerFrame = 12): Promise<PanStats> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const threadTime = async () =>
    (await cdp.send("Performance.getMetrics")).metrics.find((metric) => metric.name === "ThreadTime")?.value ?? 0;

  const before = await threadTime();
  const stats = await page.evaluate(
    async ({ frames, pixelsPerFrame }) => {
      const pane = document.querySelector(".react-flow__pane");
      const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
      if (!pane || !viewport) throw new Error("no canvas");
      const panX = () => new DOMMatrix(getComputedStyle(viewport).transform).e;
      const start = panX();
      const box = pane.getBoundingClientRect();
      let x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const mouse = (type: string) =>
        new MouseEvent(type, { clientX: x, clientY: y, button: 1, buttons: 4, bubbles: true, view: window });

      pane.dispatchEvent(mouse("mousedown"));
      const stamps: number[] = [];
      let travel = 0;
      await new Promise<void>((resolve) => {
        const step = (time: number) => {
          stamps.push(time);
          if (stamps.length > frames) return resolve();
          // Back and forth, so the pan stays over the graph.
          x += (Math.floor(stamps.length / 90) % 2 === 0 ? -1 : 1) * pixelsPerFrame;
          window.dispatchEvent(mouse("mousemove"));
          travel = Math.max(travel, Math.abs(panX() - start));
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      window.dispatchEvent(mouse("mouseup"));

      const intervals = stamps.slice(1).map((time, index) => time - (stamps[index] ?? time));
      const sorted = [...intervals].sort((a, b) => a - b);
      const at = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
      const mean = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
      return { frames: intervals.length, fps: 1000 / mean, median: at(0.5), p95: at(0.95), pannedPixels: travel };
    },
    { frames, pixelsPerFrame },
  );
  const cpuPerFrame = (((await threadTime()) - before) * 1000) / stats.frames;
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    frames: stats.frames,
    fps: round(stats.fps),
    median: round(stats.median),
    p95: round(stats.p95),
    cpuPerFrame: round(cpuPerFrame),
    pannedPixels: Math.round(stats.pannedPixels),
  };
}
