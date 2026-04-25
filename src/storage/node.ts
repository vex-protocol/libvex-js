/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Storage } from "../Storage.js";
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
    atRestAesKey: Uint8Array,
): Storage {
    const db = new Kysely<ClientDatabase>({
        dialect: new SqliteDialect({
            database: new BetterSqlite3(dbPath),
        }),
    });
    return new SqliteStorage(db, atRestAesKey);
}
