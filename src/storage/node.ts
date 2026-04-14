import type { Storage } from "../Storage.js";
import type { ClientDatabase } from "./schema.js";

import BetterSqlite3 from "better-sqlite3";
/**
 * Node.js storage factory — creates SqliteStorage with better-sqlite3 dialect.
 * Node-only — imports better-sqlite3 which is a native addon.
 */
import { Kysely, SqliteDialect } from "kysely";

import { SqliteStorage } from "./sqlite.js";

export function createNodeStorage(dbPath: string, SK: string): Storage {
    const db = new Kysely<ClientDatabase>({
        dialect: new SqliteDialect({
            database: new BetterSqlite3(dbPath),
        }),
    });
    const storage = new SqliteStorage(db, SK);
    void storage.init();
    return storage;
}
