/**
 * Node.js storage factory — creates the knex/better-sqlite3 Storage.
 * Node-only — imports Storage.ts which uses knex + better-sqlite3.
 */
import type { IStorage } from "../IStorage.js";
import type { ILogger } from "../transport/types.js";

export async function createNodeStorage(
    dbPath: string,
    SK: string,
    logger?: ILogger,
): Promise<IStorage> {
    const { Storage } = await import("../Storage.js");
    return new Storage(dbPath, SK, { logLevel: "error" });
}
