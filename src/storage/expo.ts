import type { IStorage } from "../IStorage.js";
import type { ILogger } from "../transport/types.js";
import type { ClientDatabase } from "./schema.js";

/**
 * Expo (React Native) storage factory — creates SqliteStorage with kysely-expo.
 *
 * expo-sqlite and kysely-expo are peerDependencies —
 * only available in Expo apps.
 */
import { Kysely } from "kysely";

import { SqliteStorage } from "./sqlite.js";

export async function createExpoStorage(
    dbName: string,
    SK: string,
    logger: ILogger,
): Promise<IStorage> {
    const { ExpoDialect } = await import("kysely-expo");
    const db = new Kysely<ClientDatabase>({
        dialect: new ExpoDialect({ database: dbName }) as any,
    });
    const storage = new SqliteStorage(db, SK, logger);
    await storage.init();
    return storage;
}
