import type { Storage } from "../Storage.js";
import type { Logger } from "../transport/types.js";
/**
 * Platform preset for Node.js (CLI tools, bots, tests).
 *
 * - WebSocket: ws (loaded dynamically)
 * - Storage:   Kysely + better-sqlite3
 * - Logger:    winston (loaded dynamically)
 *
 * Async because ws and winston are lazy-loaded to keep them out of
 * browser bundles that import from the main entrypoint.
 */
import type { PlatformPreset } from "./types.js";

export async function nodePreset(logLevel?: string): Promise<PlatformPreset> {
    const { default: WS } = await import("ws");
    const { createNodeWebSocket } = await import("../transport/node.js");
    const { createLogger } = await import("../utils/createLogger.js");
    const logger: Logger = createLogger("libvex", logLevel);

    return {
        adapters: {
            logger,
            WebSocket: createNodeWebSocket(WS),
        },
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
    };
}
