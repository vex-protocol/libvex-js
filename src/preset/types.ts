import type { IClientAdapters, ILogger } from "../transport/types.js";
import type { IStorage } from "../IStorage.js";

/**
 * Bundles platform-specific adapters + storage factory.
 *
 * Each platform (Tauri, Expo, Node CLI) provides a preset factory
 * that returns one of these. The store's bootstrap functions accept it
 * so app code stays a one-liner.
 */
export interface PlatformPreset {
    adapters: IClientAdapters;
    createStorage(
        dbName: string,
        privateKey: string,
        logger: ILogger,
    ): Promise<IStorage>;
}
