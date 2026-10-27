// Third-party pack plugins run in an opaque-origin sandbox: a malicious plugin can't reach our storage, the DOM or
// the network, and the factory still solves with its hooks.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { packFolder } from "../tools/pack-cli/build";

const expect = baseExpect.configure({ timeout: 15_000 });

/**
 * Template Works under another id, with a plugin that, when it loads, tries what malicious code would: read our
 * IndexedDB and caches, touch the DOM, phone home. It reports what it found as the label of a save setting, and
 * gives furnaces a speed field so the solve shows its hooks at work.
 */
const PROBE = `
const found = { origin: self.origin, dom: typeof document === "undefined" ? "none" : "present", fetch: typeof fetch };
found.idb = await new Promise((done) => {
  try {
    const request = indexedDB.open("carbonara-documents");
    request.onsuccess = () => done("open");
    request.onerror = () => done("denied");
  } catch {
    done("denied");
  }
});
try {
  await caches.keys();
  found.caches = "open";
} catch {
  found.caches = "denied";
}
const report = Object.entries(found).map(([key, value]) => key + "=" + value).join(" ");
export default {
  id: "probe",
  settingsFields: () => ({ report: { kind: "toggle", label: report, default: false } }),
  nodeFields: (building) =>
    building.id === "furnace"
      ? { speed: { kind: "number", label: "Speed", min: 50, max: 200, step: 1, unit: "%", default: 100 } }
      : {},
  effectiveRecipe: ({ recipe, fields }) => ({ ...recipe, time: recipe.time / (fields.speed / 100) }),
};
`;

async function probePack(): Promise<Uint8Array> {
  const folder = join(mkdtempSync(join(tmpdir(), "e2e-probe-")), "probe");
  cpSync("packs/_template", folder, { recursive: true });
  const manifest = join(folder, "manifest.yaml");
  writeFileSync(
    manifest,
    readFileSync(manifest, "utf8")
      .replace("id: template", "id: probe-works")
      .replace("name: Template Works", "name: Probe Works"),
  );
  writeFileSync(join(folder, "plugin", "index.ts"), PROBE);
  const built = await packFolder(folder);
  if (!built.ok) throw new Error(JSON.stringify(built.error));
  return built.value.archive;
}

async function install(page: Page, bytes: Uint8Array) {
  const dataTransfer = await page.evaluateHandle(
    (bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], "probe.cpack"));
      return transfer;
    },
    [...bytes],
  );
  await page.dispatchEvent("main", "dragenter", { dataTransfer });
  await page.dispatchEvent("main", "drop", { dataTransfer });
  const prompt = page.getByRole("dialog", { name: "Install this pack?" });
  await prompt.getByRole("button", { name: "Install" }).click();
  await expect(prompt).toBeHidden();
}

async function newFactory(page: Page, game: string) {
  await page.getByRole("button", { name: "New factory" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New factory" });
  await dialog.getByLabel("Name").fill("Probe");
  await dialog.getByRole("combobox", { name: "Game" }).click();
  await page.getByRole("option", { name: game }).click();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();
}

test("a third-party plugin can't read our storage, the DOM or the network, and still solves", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await install(page, await probePack());
  await newFactory(page, "Probe Works");

  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector.getByRole("switch")).toHaveAccessibleName(
    "origin=null dom=none fetch=undefined idb=denied caches=denied",
  );

  // Its hooks run in the sandbox: three furnaces at 150 % make 1.5 copper plates a second.
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("copper plate");
  await page.keyboard.press("Enter");
  const node = page.locator(".react-flow__node").first();
  await node.click();
  const set = async (name: string, value: string) => {
    const field = inspector.getByRole("spinbutton", { name });
    await field.fill(value);
    await field.press("Enter");
  };
  await set("Machines", "3");
  await set("Speed", "150");
  await expect(node.getByRole("listitem").filter({ hasText: "Cuprite Ore" })).toContainText("3/s");
  await expect(node).toContainText("1.5/s");
});
