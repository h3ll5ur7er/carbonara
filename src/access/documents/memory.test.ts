import { createMemoryDocumentStore } from "./memory";
import { testDocumentStore } from "./store.contract";

testDocumentStore("memory document store", createMemoryDocumentStore);
