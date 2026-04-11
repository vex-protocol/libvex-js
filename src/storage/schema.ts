/**
 * Kysely typed table interfaces for the client-side SQLite database.
 */
import type {
    ColumnType,
    Generated,
    Insertable,
    Selectable,
    Updateable,
} from "kysely";

export interface ClientDatabase {
    devices: DevicesTable;
    messages: MessagesTable;
    oneTimeKeys: OneTimeKeysTable;
    preKeys: PreKeysTable;
    sessions: SessionsTable;
}

export type DeviceRow = Selectable<DevicesTable>;

export type DeviceUpdate = Updateable<DevicesTable>;

export type MessageRow = Selectable<MessagesTable>;

export type MessageUpdate = Updateable<MessagesTable>;

export type NewDevice = Insertable<DevicesTable>;

// ── Row utility types ────────────────────────────────────────────────────────

export type NewMessage = Insertable<MessagesTable>;
export type NewOneTimeKey = Insertable<OneTimeKeysTable>;
export type NewPreKey = Insertable<PreKeysTable>;

export type NewSession = Insertable<SessionsTable>;
export type OneTimeKeyRow = Selectable<OneTimeKeysTable>;
export type PreKeyRow = Selectable<PreKeysTable>;

export type SessionRow = Selectable<SessionsTable>;
export type SessionUpdate = Updateable<SessionsTable>;
interface DevicesTable {
    deleted: number;
    deviceID: string;
    lastLogin: string;
    name: string;
    owner: string;
    signKey: string;
}

interface MessagesTable {
    authorID: string;
    decrypted: number;
    direction: string;
    forward: number;
    group: null | string;
    mailID: string;
    message: string;
    nonce: string;
    readerID: string;
    recipient: string;
    sender: string;
    timestamp: string;
}
interface OneTimeKeysTable {
    deviceID: ColumnType<string, string | undefined, string>;
    index: Generated<number>;
    keyID: ColumnType<string, string | undefined, string>;
    privateKey: string;
    publicKey: string;
    signature: string;
    userID: ColumnType<string, string | undefined, string>;
}

interface PreKeysTable {
    deviceID: ColumnType<string, string | undefined, string>;
    index: Generated<number>;
    keyID: ColumnType<string, string | undefined, string>;
    privateKey: string;
    publicKey: string;
    signature: string;
    userID: ColumnType<string, string | undefined, string>;
}
interface SessionsTable {
    deviceID: string;
    fingerprint: string;
    lastUsed: string;
    mode: string;
    publicKey: string;
    sessionID: string;
    SK: string;
    userID: string;
    verified: number;
}
