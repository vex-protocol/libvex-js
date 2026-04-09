import type { Storage } from "../Storage.js";
import type { Logger } from "../transport/types.js";
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
    logger: Logger,
): Promise<Storage> {
    const { ExpoDialect } = await import("kysely-expo");
    /* eslint-disable @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- Kysely does not export its Dialect interface; ExpoDialect implements it at runtime */
    const db = new Kysely<ClientDatabase>({
        dialect: new ExpoDialect({ database: dbName }) as any,
    });
    /* eslint-enable @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
    const storage = new SqliteStorage(db, SK, logger);
    await storage.init();
    return storage;
}
