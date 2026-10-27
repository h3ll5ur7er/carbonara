import { RuleTester } from "eslint";
import { afterAll, describe, it } from "vitest";
import { layers } from "./layers.js";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2024, sourceType: "module" } });
const at = (path, code) => ({ filename: `/repo/src/${path}`, code });
const err = (path, code) => ({ ...at(path, code), errors: [{ messageId: "layer" }] });
const external = (path, code) => ({ ...at(path, code), errors: [{ messageId: "uiModule" }] });

tester.run("layers", layers, {
  valid: [
    at("engines/solver/index.ts", `import { x } from "../../contracts/ir";`),
    at("engines/solver/index.ts", `import { x } from "../../utilities/hash";`),
    at("engines/solver/model.ts", `import { x } from "./math";`),
    at("managers/analysis.ts", `import { x } from "../engines/compiler";`),
    at("managers/analysis.ts", `import { x } from "../access/documents";`),
    at("managers/editing.test.ts", `import { x } from "./editing";`),
    at("access/documents/index.ts", `import { x } from "../../contracts/platform";`),
    at("platforms/web/storage.ts", `import { x } from "../../contracts/platform";`),
    at("client/app.tsx", `import { x } from "./canvas/adapter"; import React from "react";`),
    at("client/core/connector.ts", `import { x } from "../../contracts/rpc";`),
    at("shells/web/worker.ts", `import { x } from "../../managers/backend"; import { y } from "../../platforms/web";`),
    at("engines/solver/index.ts", `import { z } from "zod";`),
    { filename: "/repo/e2e/app.spec.ts", code: `import { x } from "../src/managers/analysis";` },
  ],
  invalid: [
    err("engines/solver/index.ts", `import { x } from "../compiler";`),
    err("engines/solver/index.ts", `import { x } from "../../access/documents";`),
    err("engines/solver/index.ts", `import { x } from "../../managers/analysis";`),
    err("access/documents/index.ts", `import { x } from "../packs";`),
    err("access/documents/index.ts", `import { x } from "../../platforms/web";`),
    err("managers/analysis.ts", `import { x } from "./editing";`),
    err("managers/analysis.ts", `import { x } from "../platforms/web";`),
    err("client/app.tsx", `import { x } from "../managers/analysis";`),
    err("client/app.tsx", `import { x } from "../engines/solver";`),
    err("contracts/ir.ts", `import { x } from "../utilities/hash";`),
    err("utilities/hash.ts", `import { x } from "../engines/solver";`),
    err("engines/solver/index.ts", `export { x } from "../compiler";`),
    err("engines/solver/index.ts", `const m = import("../compiler");`),
    external("engines/editing/index.ts", `import { produce } from "immer"; import React from "react";`),
    external("managers/analysis.ts", `import { create } from "zustand";`),
  ],
});
