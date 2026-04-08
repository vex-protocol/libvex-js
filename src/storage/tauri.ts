import type { IStorage } from "../IStorage.js";
import type { ILogger } from "../transport/types.js";
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
    logger: ILogger,
): Promise<IStorage> {
    const { TauriSqliteDialect } = await import("kysely-dialect-tauri");
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    const db = new Kysely<ClientDatabase>({
        dialect: new TauriSqliteDialect({
            database: () => Database.load(`sqlite:${dbName}`),
        }) as any,
    });
    const storage = new SqliteStorage(db, SK, logger);
    await storage.init();
    return storage;
}
