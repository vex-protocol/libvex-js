import type { Storage } from "../Storage.js";
import type { Logger } from "../transport/types.js";
/**
 * Platform preset for Node.js (CLI tools, bots, tests).
 *
 * - WebSocket: native global (Node 22+)
 * - Storage:   Kysely + better-sqlite3
 * - Logger:    winston (loaded dynamically)
 */
import type { PlatformPreset } from "./common.js";

export async function nodePreset(logLevel?: string): Promise<PlatformPreset> {
    const { createLogger } = await import("../utils/createLogger.js");
    const logger: Logger = createLogger("libvex", logLevel);

    return {
        async createStorage(
            dbName,
            privateKey,
            storageLogger,
        ): Promise<Storage> {
            const { createNodeStorage } = await import("../storage/node.js");

            const storage: Storage = createNodeStorage(
                dbName,
                privateKey,
                storageLogger,
            );
            return storage;
        },
        deviceName: process.platform,
        logger,
    };
}
