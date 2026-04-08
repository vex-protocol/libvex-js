import type { IStorage } from "../IStorage.js";
import type { ILogger } from "../transport/types.js";
import type { ClientDatabase } from "./schema.js";

import BetterSqlite3 from "better-sqlite3";
/**
 * Node.js storage factory — creates SqliteStorage with better-sqlite3 dialect.
 * Node-only — imports better-sqlite3 which is a native addon.
 */
import { Kysely, SqliteDialect } from "kysely";

import { SqliteStorage } from "./sqlite.js";

export function createNodeStorage(
    dbPath: string,
    SK: string,
    logger?: ILogger,
): IStorage {
    const db = new Kysely<ClientDatabase>({
        dialect: new SqliteDialect({
            database: new BetterSqlite3(dbPath),
        }),
    });
    const log: ILogger = logger ?? {
        debug() {},
        error() {},
        info() {},
        warn() {},
    };
    const storage = new SqliteStorage(db, SK, log);
    storage.init();
    return storage;
}
