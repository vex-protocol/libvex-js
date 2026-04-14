import type { Storage } from "../Storage.js";
/**
 * Platform preset for Node.js (CLI tools, bots, tests).
 *
 * - WebSocket: native global (Node 22+)
 * - Storage:   Kysely + better-sqlite3
 */
import type { PlatformPreset } from "./common.js";

export function nodePreset(): PlatformPreset {
    return {
        async createStorage(dbName, privateKey): Promise<Storage> {
            const { createNodeStorage } = await import("../storage/node.js");
            return createNodeStorage(dbName, privateKey);
        },
        deviceName: process.platform,
    };
}
