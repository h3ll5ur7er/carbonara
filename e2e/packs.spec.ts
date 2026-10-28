// Installing a third-party pack: drop a .cpack, check the trust prompt, confirm.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { zipSync } from "fflate";
import { sha256 } from "../src/access/packs/archive";
import { packFolder } from "../tools/pack-cli/build";

/** A third-party pack: the template under another id. */
async function demoPack(): Promise<{ bytes: Uint8Array; hash: string }> {
  const folder = join(mkdtempSync(join(tmpdir(), "e2e-pack-")), "demo");
  cpSync("packs/_template", folder, { recursive: true });
  const manifest = join(folder, "manifest.yaml");
  writeFileSync(
    manifest,
    readFileSync(manifest, "utf8")
      .replace("id: template", "id: demo-works")
      .replace(/^version: .*$/m, "version: 1.2.0"),
  );
  // The template's plugin imports the contracts through a path relative to its own folder.
  const plugin = join(folder, "plugin", "index.ts");
  writeFileSync(plugin, `export default { id: "demo-works" };\n`);
  const built = await packFolder(folder);
  if (!built.ok) throw new Error(JSON.stringify(built.error));
  return { bytes: built.value.archive, hash: await sha256(built.value.archive) };
}

async function dropFile(page: Page, name: string, bytes: Uint8Array): Promise<void> {
  const dataTransfer = await page.evaluateHandle(
    ({ name, bytes }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], name));
      return transfer;
    },
    { name, bytes: [...bytes] },
  );
  await page.dispatchEvent("main", "dragenter", { dataTransfer });
  await page.dispatchEvent("main", "drop", { dataTransfer });
}

test("the pack manager lists the built-in template pack in dev", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Game packs" }).click();
  const manager = page.getByRole("dialog", { name: "Game packs" });
  await expect(manager.getByRole("listitem").filter({ hasText: "Template Works" })).toContainText("Built in");
});

test("dropping a third-party .cpack shows the trust prompt and installs it after confirmation", async ({ page }) => {
  const { bytes, hash } = await demoPack();
  await page.goto("/");
  await dropFile(page, "demo-works-1.2.0.cpack", bytes);

  const prompt = page.getByRole("dialog", { name: "Install this pack?" });
  await expect(prompt).toContainText("Template Works");
  await expect(prompt).toContainText("demo-works");
  await expect(prompt).toContainText("1.2.0");
  await expect(prompt).toContainText(hash);
  await prompt.getByRole("button", { name: "Install" }).click();
  await expect(prompt).toBeHidden();

  await page.getByRole("button", { name: "Game packs" }).click();
  const installed = page.getByRole("dialog", { name: "Game packs" }).getByRole("listitem").filter({
    hasText: "demo-works",
  });
  await expect(installed).toContainText("1.2.0");
  await expect(installed.getByRole("button", { name: "Remove" })).toBeVisible();

  // Installed packs are kept in IndexedDB.
  await page.reload();
  await page.getByRole("button", { name: "Game packs" }).click();
  const kept = page.getByRole("dialog", { name: "Game packs" }).getByRole("listitem").filter({ hasText: "demo-works" });
  await kept.getByRole("button", { name: "Remove" }).click();
  await expect(kept).toBeHidden();
});

test("cancelling the trust prompt installs nothing", async ({ page }) => {
  const { bytes } = await demoPack();
  await page.goto("/");
  await dropFile(page, "demo.cpack", bytes);
  const prompt = page.getByRole("dialog", { name: "Install this pack?" });
  await prompt.getByRole("button", { name: "Cancel" }).click();
  await expect(prompt).toBeHidden();
  await page.getByRole("button", { name: "Game packs" }).click();
  await expect(page.getByRole("dialog", { name: "Game packs" })).not.toContainText("demo-works");
});

test("a broken pack shows where it's broken and can't be installed", async ({ page }) => {
  const text = (value: string) => new TextEncoder().encode(value);
  const bytes = zipSync({
    "manifest.yaml": text("id: broken\nname: Broken\nversion: 1.0.0\nengine: ^9\nplugin: plugin/index.js\n"),
    "plugin/index.js": text("export default { id: 'broken' };"),
  });
  await page.goto("/");
  await dropFile(page, "broken.cpack", bytes);
  const prompt = page.getByRole("dialog", { name: "This pack can't be installed" });
  await expect(prompt).toContainText(
    "manifest.yaml:4:1: engine: Needs pack format ^9, but this version of Carbonara reads pack format 1.2.0",
  );
  await expect(prompt.getByRole("button", { name: "Install" })).toHaveCount(0);
});
