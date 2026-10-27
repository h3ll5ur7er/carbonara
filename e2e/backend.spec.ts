import { expect, test } from "@playwright/test";

test("the backend worker answers through the connector", async ({ page }) => {
  await page.goto("/");
  const answer = await page.evaluate(async () => {
    const worker = new Worker(new URL("/backend.worker.ts", location.href), { type: "module" });
    return new Promise((resolve) => {
      worker.addEventListener("message", (event) => resolve(event.data));
      worker.postMessage({ id: 1, manager: "workspace", method: "ping", args: {} });
    });
  });
  expect(answer).toEqual({ id: 1, ok: true, value: "pong" });
});
