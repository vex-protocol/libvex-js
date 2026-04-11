import type { Storage } from "../Storage.js";
import type { Logger } from "../transport/types.js";

/** Internal preset interface used by nodePreset and testPreset. */
export interface PlatformPreset {
    createStorage(
        dbName: string,
        privateKey: string,
        logger: Logger,
    ): Promise<Storage>;
    deviceName: string;
    logger: Logger;
}
