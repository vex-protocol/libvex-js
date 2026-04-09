import type { Storage } from "../Storage.js";
import type { ClientAdapters, Logger } from "../transport/types.js";

/**
 * Bundles platform-specific adapters + storage factory.
 *
 * Each platform (Tauri, Expo, Node CLI) provides a preset factory
 * that returns one of these. The store's bootstrap functions accept it
 * so app code stays a one-liner.
 */
export interface PlatformPreset {
    adapters: ClientAdapters;
    createStorage(
        dbName: string,
        privateKey: string,
        logger: Logger,
    ): Promise<Storage>;
    deviceName: string;
}
