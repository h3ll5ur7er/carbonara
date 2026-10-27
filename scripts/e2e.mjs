// Runs Playwright inside the pinned Playwright image, so screenshots render the same here and in CI
// (fonts, anti-aliasing and the browser build all come from the image). Arguments go to `playwright test`.
// CI runs the e2e job inside that image already and sets PLAYWRIGHT_IN_IMAGE, which runs Playwright directly.
import { spawnSync } from "node:child_process";

export const IMAGE = "mcr.microsoft.com/playwright:v1.63.0-noble";
const args = process.argv.slice(2);

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

/** No package manager needed: the image only gets the repository (node_modules included) mounted. */
const PLAYWRIGHT = ["node_modules/@playwright/test/cli.js", "test"];

if (process.env.PLAYWRIGHT_IN_IMAGE) run("node", [...PLAYWRIGHT, ...args]);

if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
  console.error(
    "Docker isn't running, so the e2e tests can't run in the pinned Playwright image.\n" +
      "Start it (e.g. `dockerd &`) or run `pnpm e2e:host` — screenshots may then differ from the baselines.",
  );
  process.exit(1);
}

const env = ["E2E_PORT", "CI", "E2E_PERF"].flatMap((name) =>
  process.env[name] ? ["-e", `${name}=${process.env[name]}`] : [],
);
run("docker", [
  "run",
  "--rm",
  "--network=host",
  "--ipc=host",
  "-v",
  `${process.cwd()}:/work`,
  "-w",
  "/work",
  "-e",
  "PLAYWRIGHT_IN_IMAGE=1",
  ...env,
  IMAGE,
  "node",
  ...PLAYWRIGHT,
  ...args,
]);
