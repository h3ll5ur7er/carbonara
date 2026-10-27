import { testKeyValueStorage } from "../contracts/platform.contract";
import { createMemoryKeyValueStorage } from "./memory-key-value";

testKeyValueStorage("memory storage", () => {
  const entries = new Map<string, unknown>();
  return { open: () => createMemoryKeyValueStorage(entries) };
});
