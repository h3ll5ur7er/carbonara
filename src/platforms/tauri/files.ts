// Desktop platform: native open and save dialogs. Hides the Rust shell's `open_file` and `save_file` commands
// (src/shells/tauri/src-tauri/src/dialogs.rs), which show the dialog and read or write the file themselves, so
// the webview never handles paths.
import type { FileAccess, PickedFile } from "../../contracts/platform";
import type { Invoke } from "./invoke";

/** A file as the shell hands it over: its contents, or why it couldn't be read. Bytes travel as JSON numbers. */
export type FileContents = { name: string; bytes: number[] } | { name: string; error: string };

export function pickedFile(contents: FileContents): PickedFile {
  if ("error" in contents) throw new Error(`Couldn't read ${contents.name}: ${contents.error}`);
  return { name: contents.name, bytes: new Uint8Array(contents.bytes) };
}

export function createTauriFileAccess(invoke: Invoke): FileAccess {
  return {
    async open(fileType) {
      const contents = (await invoke("open_file", { fileType })) as FileContents | null;
      return contents ? pickedFile(contents) : undefined;
    },
    async save(bytes, name, fileType) {
      const saved = (await invoke("save_file", { name, fileType, bytes: Array.from(bytes) })) as string | null;
      return saved ?? undefined;
    },
  };
}
