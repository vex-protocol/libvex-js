import type { Storage } from "../Storage.js";

/** Internal preset interface used by nodePreset and testPreset. */
export interface PlatformPreset {
    createStorage(dbName: string, privateKey: string): Promise<Storage>;
    deviceName: string;
}
