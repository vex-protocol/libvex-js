/**
 * Platform preset for Node.js (CLI tools, bots, tests).
 *
 * - WebSocket: ws (loaded dynamically)
 * - Storage:   knex + better-sqlite3
 * - Logger:    winston (loaded dynamically)
 *
 * Async because ws and winston are lazy-loaded to keep them out of
 * browser bundles that import from the main entrypoint.
 */
import type { PlatformPreset } from "./types.js";
import type { ILogger } from "../transport/types.js";

export async function nodePreset(logLevel?: string): Promise<PlatformPreset> {
    const { default: WebSocket } = await import("ws");
    const { createLogger } = await import("../utils/createLogger.js");
    const logger: ILogger = createLogger("libvex", logLevel);

    return {
        adapters: {
            logger,
            WebSocket: WebSocket as any,
        },
        async createStorage(dbName, privateKey, _logger) {
            const { Storage } = await import("../Storage.js");
            return new Storage(dbName, privateKey, {
                logLevel: logLevel as any,
            });
        },
    };
}
