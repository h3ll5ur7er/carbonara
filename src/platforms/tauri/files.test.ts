import { describe, expect, it } from "vitest";
import { createTauriFileAccess, pickedFile } from "./files";
import type { Invoke } from "./invoke";

const factory = { description: "Carbonara factory", extensions: ["carbonara"] };

/** Records the calls and answers each command with `answers[command]`. */
function commands(answers: Record<string, unknown>) {
  const calls: [string, Record<string, unknown> | undefined][] = [];
  const invoke: Invoke = async (command, args) => {
    calls.push([command, args]);
    return answers[command];
  };
  return { invoke, calls };
}

describe("files on desktop", () => {
  it("opens the file the person picks in the native dialog", async () => {
    const { invoke, calls } = commands({ open_file: { name: "Iron.carbonara", bytes: [1, 2, 3] } });
    const file = await createTauriFileAccess(invoke).open(factory);
    expect(file).toEqual({ name: "Iron.carbonara", bytes: new Uint8Array([1, 2, 3]) });
    expect(calls).toEqual([["open_file", { fileType: factory }]]);
  });

  it("opens nothing when the person cancels", async () => {
    const { invoke } = commands({ open_file: null });
    await expect(createTauriFileAccess(invoke).open(factory)).resolves.toBeUndefined();
  });

  it("fails with the file's name when it can't be read", async () => {
    const { invoke } = commands({ open_file: { name: "Iron.carbonara", error: "Permission denied" } });
    await expect(createTauriFileAccess(invoke).open(factory)).rejects.toThrow(
      "Couldn't read Iron.carbonara: Permission denied",
    );
  });

  it("saves where the person chooses and says under which name", async () => {
    const { invoke, calls } = commands({ save_file: "Iron (2).carbonara" });
    const saved = await createTauriFileAccess(invoke).save(new Uint8Array([4, 5]), "Iron.carbonara", factory);
    expect(saved).toBe("Iron (2).carbonara");
    expect(calls).toEqual([["save_file", { name: "Iron.carbonara", fileType: factory, bytes: [4, 5] }]]);
  });

  it("saves nothing when the person cancels", async () => {
    const { invoke } = commands({ save_file: null });
    await expect(createTauriFileAccess(invoke).save(new Uint8Array(), "Iron.carbonara", factory)).resolves.toBe(
      undefined,
    );
  });

  it("reads files the shell hands over", () => {
    expect(pickedFile({ name: "pack.cpack", bytes: [9] })).toEqual({ name: "pack.cpack", bytes: new Uint8Array([9]) });
  });
});
