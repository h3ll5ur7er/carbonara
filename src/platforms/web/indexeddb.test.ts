import "fake-indexeddb/auto";
import { testKeyValueStorage } from "../../contracts/platform.contract";
import { createIndexedDbStorage } from "./indexeddb";

let databases = 0;

testKeyValueStorage("IndexedDB storage", () => {
  const name = `test-${databases++}`;
  return { open: () => createIndexedDbStorage(name) };
});
