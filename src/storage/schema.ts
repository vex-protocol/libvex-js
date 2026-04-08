/**
 * Kysely typed table interfaces for the client-side SQLite database.
 */
import type { Generated, Insertable, Selectable, Updateable } from "kysely";

interface MessagesTable {
    nonce: string;
    sender: string;
    recipient: string;
    group: string | null;
    mailID: string;
    message: string;
    direction: string;
    timestamp: string;
    decrypted: number;
    forward: number;
    authorID: string;
    readerID: string;
}

interface DevicesTable {
    deviceID: string;
    owner: string;
    signKey: string;
    name: string;
    lastLogin: string;
    deleted: number;
}

interface SessionsTable {
    sessionID: string;
    userID: string;
    deviceID: string;
    SK: string;
    publicKey: string;
    fingerprint: string;
    mode: string;
    lastUsed: string;
    verified: number;
}

interface PreKeysTable {
    index: Generated<number>;
    keyID: string;
    userID: string;
    deviceID: string;
    privateKey: string;
    publicKey: string;
    signature: string;
}

interface OneTimeKeysTable {
    index: Generated<number>;
    keyID: string;
    userID: string;
    deviceID: string;
    privateKey: string;
    publicKey: string;
    signature: string;
}

export interface ClientDatabase {
    messages: MessagesTable;
    devices: DevicesTable;
    sessions: SessionsTable;
    preKeys: PreKeysTable;
    oneTimeKeys: OneTimeKeysTable;
}

// ── Row utility types ────────────────────────────────────────────────────────

export type MessageRow = Selectable<MessagesTable>;
export type NewMessage = Insertable<MessagesTable>;
export type MessageUpdate = Updateable<MessagesTable>;

export type DeviceRow = Selectable<DevicesTable>;
export type NewDevice = Insertable<DevicesTable>;
export type DeviceUpdate = Updateable<DevicesTable>;

export type SessionRow = Selectable<SessionsTable>;
export type NewSession = Insertable<SessionsTable>;
export type SessionUpdate = Updateable<SessionsTable>;

export type PreKeyRow = Selectable<PreKeysTable>;
export type NewPreKey = Insertable<PreKeysTable>;

export type OneTimeKeyRow = Selectable<OneTimeKeysTable>;
export type NewOneTimeKey = Insertable<OneTimeKeysTable>;
