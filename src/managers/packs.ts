// Packs manager: the use cases around game packs. List them, show what a .cpack is before the user trusts it,
// install it and remove it. The packs engine decides what's valid; the packs access keeps and loads packs.
import { openArchive, sha256 } from "../access/packs/archive";
import type { PackLibrary } from "../access/packs/library";
import type { Events, ManagerImplementation } from "../contracts/managers";
import { runtimeOf } from "../engines/compiler";
import { readManifest, readPackFiles } from "../engines/packs/files";
import type { EventBus } from "../utilities/events";

export interface PacksManagerOptions {
  library: PackLibrary;
  bus: EventBus<Events>;
}

export function createPacksManager({ library, bus }: PacksManagerOptions): ManagerImplementation<"packs"> {
  const announce = async () => bus.publish("packsChanged", { packs: await library.list() });
  async function loaded(packId: string) {
    const pack = await library.get(packId);
    if (!pack) throw new Error(`Unknown pack '${packId}'`);
    return pack;
  }

  return {
    listPacks: () => library.list(),

    getPackData: async ({ packId }) => (await loaded(packId)).data,

    getPackIcons: ({ packId }) => library.icons(packId),

    // Asks the plugin where it runs: third-party plugins never run in the client or the backend worker.
    describePlugin: async ({ packId, settings }) => runtimeOf(await loaded(packId)).describe(settings),

    // Runs no pack code: this is what the trust prompt shows before the user decides.
    async inspectPack({ bytes }) {
      const archive = await openArchive(bytes);
      if (!archive.ok) return { manifest: null, hash: await sha256(bytes), issues: archive.error };
      const { files, hash } = archive.value;
      const pack = readPackFiles(files);
      if (pack.ok) return { manifest: pack.value.manifest, hash, issues: [] };
      const manifest = readManifest(files);
      return { manifest: manifest.ok ? manifest.value : null, hash, issues: pack.error };
    },

    async installPack({ bytes }) {
      const archive = await openArchive(bytes);
      if (!archive.ok) return archive;
      const { files, hash } = archive.value;
      const pack = readPackFiles(files);
      if (!pack.ok) return pack;
      const plugin = new TextDecoder().decode(files[pack.value.manifest.plugin]);
      const installed = await library.install({ ...pack.value, hash, plugin });
      if (installed.ok) await announce();
      return installed;
    },

    async removePack({ packId }) {
      if (!(await library.remove(packId))) throw new Error(`No installed pack '${packId}'`);
      await announce();
      return undefined;
    },
  };
}
