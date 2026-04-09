import type { Storage } from "../Storage.js";
import type { Logger } from "../transport/types.js";
import type { ClientDatabase } from "./schema.js";

/**
 * Tauri storage factory — creates SqliteStorage with kysely-dialect-tauri.
 *
 * @tauri-apps/plugin-sql and kysely-dialect-tauri are peerDependencies —
 * only available inside a Tauri app.
 */
import { Kysely } from "kysely";

import { SqliteStorage } from "./sqlite.js";

export async function createTauriStorage(
    dbName: string,
    SK: string,
    logger: Logger,
): Promise<Storage> {
    const { TauriSqliteDialect } = await import("kysely-dialect-tauri");
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    /* eslint-disable @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- Kysely does not export its Dialect interface; TauriSqliteDialect implements it at runtime */
    const db = new Kysely<ClientDatabase>({
        dialect: new TauriSqliteDialect({
            database: () => Database.load(`sqlite:${dbName}`),
        }) as any,
    });
    /* eslint-enable @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
    const storage = new SqliteStorage(db, SK, logger);
    await storage.init();
    return storage;
}
