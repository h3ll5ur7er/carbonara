// Test support: the template pack's data (packs/_template), and a scene that uses its water loop.
import { readdirSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import type { Document } from "../../contracts/document";
import { PackData, PackDataFile } from "../../contracts/pack";

const folder = new URL("../../../packs/_template/data/", import.meta.url);

/** The template's data files merged the way the packs engine merges them (arrays concatenated). */
export function templatePack(): PackData {
  const merged: Record<string, unknown[]> = {};
  let units: unknown;
  for (const name of readdirSync(folder).sort()) {
    const file = PackDataFile.parse(parse(readFileSync(new URL(name, folder), "utf8")));
    const { units: fileUnits, ...sections } = file;
    units ??= fileUnits;
    for (const [section, entries] of Object.entries(sections) as [string, unknown[]][]) {
      (merged[section] ??= []).push(...entries);
    }
  }
  return PackData.parse({ ...merged, units });
}

/**
 * Ferrite is washed with water; the dirty water is purified and merged back into the washer's water.
 * The clean ferrite is smelted into the iron plates the sink wants.
 */
export function waterLoop(): Document {
  return {
    format: "carbonara",
    version: 1,
    id: "doc-water",
    name: "Water loop",
    pack: { id: "template", version: "1.0.0", hash: "sha256-template" },
    graph: {
      nodes: {
        ore: { kind: "source", item: "ferrite-ore" },
        water: { kind: "source", item: "water" },
        merge: { kind: "junction" },
        wash: { kind: "recipe", recipe: "wash-ferrite" },
        purify: { kind: "recipe", recipe: "purify-water" },
        smelt: { kind: "recipe", recipe: "iron-plate" },
        plates: { kind: "sink", item: "iron-plate", targetPerSecond: 1 },
        hint: { kind: "note", text: "Recycle the water" },
      },
      edges: {
        "ore-wash": { from: "ore", to: "wash", item: "ferrite-ore", logistics: "conveyor-1" },
        "water-merge": { from: "water", to: "merge", item: "water", logistics: "pipe" },
        "purify-merge": { from: "purify", to: "merge", item: "water" },
        "merge-wash": { from: "merge", to: "wash", item: "water" },
        "wash-purify": { from: "wash", to: "purify", item: "dirty-water" },
        "wash-smelt": { from: "wash", to: "smelt", item: "clean-ferrite" },
        "smelt-plates": { from: "smelt", to: "plates", item: "iron-plate" },
      },
    },
    blueprints: {},
    layout: {},
    settings: {},
  };
}

/**
 * Iron plates from clean ferrite in a blueprint designed for 3 furnaces (1 plate/s), placed once and asked
 * for `target` plates per second.
 */
export function platesModule(target = 2): Document {
  return {
    format: "carbonara",
    version: 1,
    id: "doc-plates",
    name: "Plates module",
    pack: { id: "template", version: "1.0.0", hash: "sha256-template" },
    graph: {
      nodes: {
        ferrite: { kind: "source", item: "clean-ferrite" },
        module: { kind: "instance", blueprint: "plates" },
        out: { kind: "sink", item: "iron-plate", targetPerSecond: target },
      },
      edges: {
        "ferrite-module": { from: "ferrite", to: "module", toPort: "in", item: "clean-ferrite" },
        "module-out": { from: "module", fromPort: "out", to: "out", item: "iron-plate" },
      },
    },
    blueprints: {
      plates: {
        name: "Plates",
        graph: {
          nodes: {
            in: { kind: "port", direction: "in", item: "clean-ferrite" },
            smelt: { kind: "recipe", recipe: "iron-plate", pin: { type: "machines", count: 3 } },
            out: { kind: "port", direction: "out", item: "iron-plate" },
          },
          edges: {
            "in-smelt": { from: "in", to: "smelt", item: "clean-ferrite", logistics: "conveyor-1" },
            "smelt-out": { from: "smelt", to: "out", item: "iron-plate" },
          },
        },
      },
    },
    layout: {},
    settings: {},
  };
}
