/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Message } from "../index.js";
import type { Storage } from "../Storage.js";
import type {
    PreKeysCrypto,
    SessionCrypto,
    UnsavedPreKey,
} from "../types/index.js";
import type {
    ClientDatabase,
    DeviceRow,
    MessageRow,
    SessionRow,
} from "./schema.js";
import type { Device, PreKeysSQL, SessionSQL } from "@vex-chat/types";
import type { Kysely } from "kysely";

/**
 * Unified Kysely-based SQLite storage implementation.
 *
 * Accepts any `Kysely<ClientDatabase>` instance — the caller picks the
 * dialect (better-sqlite3, Tauri plugin-sql, expo-sqlite, etc.) and
 * passes the configured Kysely handle here.
 *
 * This replaces three separate storage classes (Storage.ts, TauriStorage,
 * ExpoStorage) with a single implementation.
 */
import {
    type KeyPair,
    xBoxKeyPairFromSecret,
    XKeyConvert,
    xMakeNonce,
    xSecretbox,
    xSecretboxOpen,
    xSignKeyPairFromSecret,
    XUtils,
} from "@vex-chat/crypto";

import { EventEmitter } from "eventemitter3";

export class SqliteStorage extends EventEmitter implements Storage {
    public ready = false;
    private closing = false;
    private readonly db: Kysely<ClientDatabase>;
    private readonly idKeys: KeyPair;

    constructor(db: Kysely<ClientDatabase>, SK: string) {
        super();
        this.db = db;

        const idKeys = XKeyConvert.convertKeyPair(
            xSignKeyPairFromSecret(XUtils.decodeHex(SK)),
        );
        if (!idKeys) {
            throw new Error("Can't convert SK!");
        }
        this.idKeys = idKeys;
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    async close(): Promise<void> {
        this.closing = true;
        await this.db.destroy();
    }

    async deleteHistory(channelOrUserID: string): Promise<void> {
        await this.db
            .deleteFrom("messages")
            .where((eb) =>
                eb.or([
                    eb("group", "=", channelOrUserID),
                    eb.and([
                        eb("group", "is", null),
                        eb("authorID", "=", channelOrUserID),
                    ]),
                    eb.and([
                        eb("group", "is", null),
                        eb("readerID", "=", channelOrUserID),
                    ]),
                ]),
            )
            .execute();
    }

    // ── Messages ─────────────────────────────────────────────────────────────

    async deleteMessage(mailID: string): Promise<void> {
        if (this.closing) {
            return;
        }
        await this.db
            .deleteFrom("messages")
            .where("mailID", "=", mailID)
            .execute();
    }

    async deleteOneTimeKey(index: number): Promise<void> {
        if (this.closing) {
            return;
        }
        await this.db
            .deleteFrom("oneTimeKeys")
            .where("index", "=", index)
            .execute();
    }

    async getAllSessions(): Promise<SessionSQL[]> {
        if (this.closing) {
            return [];
        }
        const rows = await this.db
            .selectFrom("sessions")
            .selectAll()
            .orderBy("lastUsed", "desc")
            .execute();

        return rows.map((s) => this.sessionRowToSQL(s));
    }

    async getDevice(deviceID: string): Promise<Device | null> {
        const rows = await this.db
            .selectFrom("devices")
            .selectAll()
            .where("deviceID", "=", deviceID)
            .execute();

        const row = rows[0];
        if (!row) {
            return null;
        }
        return this.deviceRowToDevice(row);
    }

    async getGroupHistory(channelID: string): Promise<Message[]> {
        if (this.closing) {
            return [];
        }

        const messages = await this.db
            .selectFrom("messages")
            .selectAll()
            .where("group", "=", channelID)
            .orderBy("timestamp", "asc")
            .execute();

        return this.decryptMessages(messages);
    }

    async getMessageHistory(userID: string): Promise<Message[]> {
        if (this.closing) {
            return [];
        }

        const messages = await this.db
            .selectFrom("messages")
            .selectAll()
            .where((eb) =>
                eb.or([
                    eb.and([
                        eb("direction", "=", "incoming"),
                        eb("authorID", "=", userID),
                        eb("group", "is", null),
                    ]),
                    eb.and([
                        eb("direction", "=", "outgoing"),
                        eb("readerID", "=", userID),
                        eb("group", "is", null),
                    ]),
                ]),
            )
            .orderBy("timestamp", "asc")
            .execute();

        return this.decryptMessages(messages);
    }

    // ── Sessions ─────────────────────────────────────────────────────────────

    async getOneTimeKey(index: number): Promise<null | PreKeysCrypto> {
        await this.untilReady();
        if (this.closing) {
            return null;
        }

        const rows = await this.db
            .selectFrom("oneTimeKeys")
            .selectAll()
            .where("index", "=", index)
            .execute();

        const otkInfo = rows[0];
        if (!otkInfo) {
            return null;
        }
        return {
            index: otkInfo.index,
            keyPair: xBoxKeyPairFromSecret(
                XUtils.decodeHex(this.unsealHex(otkInfo.privateKey)),
            ),
            signature: XUtils.decodeHex(otkInfo.signature),
        };
    }

    async getPreKeys(): Promise<null | PreKeysCrypto> {
        await this.untilReady();
        if (this.closing) {
            return null;
        }

        const rows = await this.db.selectFrom("preKeys").selectAll().execute();

        const preKeyInfo = rows[0];
        if (!preKeyInfo) {
            return null;
        }
        return {
            index: preKeyInfo.index,
            keyPair: xBoxKeyPairFromSecret(
                XUtils.decodeHex(this.unsealHex(preKeyInfo.privateKey)),
            ),
            signature: XUtils.decodeHex(preKeyInfo.signature),
        };
    }

    async getSessionByDeviceID(
        deviceID: string,
    ): Promise<null | SessionCrypto> {
        if (this.closing) {
            return null;
        }
        const rows = await this.db
            .selectFrom("sessions")
            .selectAll()
            .where("deviceID", "=", deviceID)
            .orderBy("lastUsed", "desc")
            .limit(1)
            .execute();

        const sessionRow = rows[0];
        if (!sessionRow) {
            return null;
        }

        return this.sqlToCrypto(this.sessionRowToSQL(sessionRow));
    }

    async getSessionByPublicKey(
        publicKey: Uint8Array,
    ): Promise<null | SessionCrypto> {
        if (this.closing) {
            return null;
        }
        const hex = XUtils.encodeHex(publicKey);

        const rows = await this.db
            .selectFrom("sessions")
            .selectAll()
            .where("publicKey", "=", hex)
            .limit(1)
            .execute();

        const sessionRow = rows[0];
        if (!sessionRow) {
            return null;
        }

        return this.sqlToCrypto(this.sessionRowToSQL(sessionRow));
    }

    async init(): Promise<void> {
        try {
            await this.db.schema
                .createTable("messages")
                .ifNotExists()
                .addColumn("nonce", "text", (col) => col.primaryKey())
                .addColumn("sender", "text")
                .addColumn("recipient", "text")
                .addColumn("group", "text")
                .addColumn("mailID", "text")
                .addColumn("message", "text")
                .addColumn("direction", "text")
                .addColumn("timestamp", "text")
                .addColumn("decrypted", "integer")
                .addColumn("forward", "integer")
                .addColumn("authorID", "text")
                .addColumn("readerID", "text")
                .execute();

            await this.db.schema
                .createTable("devices")
                .ifNotExists()
                .addColumn("deviceID", "text", (col) => col.primaryKey())
                .addColumn("owner", "text")
                .addColumn("signKey", "text")
                .addColumn("name", "text")
                .addColumn("lastLogin", "text")
                .addColumn("deleted", "integer")
                .execute();

            await this.db.schema
                .createTable("sessions")
                .ifNotExists()
                .addColumn("sessionID", "text", (col) => col.primaryKey())
                .addColumn("userID", "text")
                .addColumn("deviceID", "text")
                .addColumn("SK", "text", (col) => col.unique())
                .addColumn("publicKey", "text")
                .addColumn("fingerprint", "text")
                .addColumn("mode", "text")
                .addColumn("lastUsed", "text")
                .addColumn("verified", "integer")
                .execute();

            await this.db.schema
                .createTable("preKeys")
                .ifNotExists()
                .addColumn("index", "integer", (col) =>
                    col.primaryKey().autoIncrement(),
                )
                .addColumn("keyID", "text", (col) => col.unique())
                .addColumn("userID", "text")
                .addColumn("deviceID", "text")
                .addColumn("privateKey", "text")
                .addColumn("publicKey", "text")
                .addColumn("signature", "text")
                .execute();

            await this.db.schema
                .createTable("oneTimeKeys")
                .ifNotExists()
                .addColumn("index", "integer", (col) =>
                    col.primaryKey().autoIncrement(),
                )
                .addColumn("keyID", "text", (col) => col.unique())
                .addColumn("userID", "text")
                .addColumn("deviceID", "text")
                .addColumn("privateKey", "text")
                .addColumn("publicKey", "text")
                .addColumn("signature", "text")
                .execute();

            this.ready = true;
            this.emit("ready");
        } catch (err: unknown) {
            this.emit(
                "error",
                err instanceof Error ? err : new Error(String(err)),
            );
        }
    }

    async markSessionUsed(sessionID: string): Promise<void> {
        if (this.closing) {
            return;
        }
        await this.db
            .updateTable("sessions")
            .set({ lastUsed: new Date(Date.now()).toISOString() })
            .where("sessionID", "=", sessionID)
            .execute();
    }

    // ── PreKeys / OneTimeKeys ────────────────────────────────────────────────

    async markSessionVerified(sessionID: string): Promise<void> {
        if (this.closing) {
            return;
        }
        await this.db
            .updateTable("sessions")
            .set({ verified: 1 })
            .where("sessionID", "=", sessionID)
            .execute();
    }

    async purgeHistory(): Promise<void> {
        await this.db.deleteFrom("messages").execute();
    }

    async purgeKeyData(): Promise<void> {
        await this.db.deleteFrom("sessions").execute();
        await this.db.deleteFrom("oneTimeKeys").execute();
        await this.db.deleteFrom("preKeys").execute();
        await this.db.deleteFrom("messages").execute();
    }

    async saveDevice(device: Device): Promise<void> {
        if (this.closing) {
            return;
        }
        try {
            await this.db
                .insertInto("devices")
                .values({
                    deleted: device.deleted ? 1 : 0,
                    deviceID: device.deviceID,
                    lastLogin: device.lastLogin,
                    name: device.name,
                    owner: device.owner,
                    signKey: device.signKey,
                })
                .execute();
        } catch (err: unknown) {
            if (this.isDuplicateError(err)) {
                // duplicate deviceID — ignore
            } else {
                throw err;
            }
        }
    }

    // ── Devices ──────────────────────────────────────────────────────────────

    async saveMessage(message: Message): Promise<void> {
        if (this.closing) {
            return;
        }

        // Encrypt plaintext with our idkey before saving to disk
        const encryptedMessage = XUtils.encodeHex(
            xSecretbox(
                XUtils.decodeUTF8(message.message),
                XUtils.decodeHex(message.nonce),
                this.idKeys.secretKey,
            ),
        );

        try {
            await this.db
                .insertInto("messages")
                .values({
                    authorID: message.authorID,
                    decrypted: message.decrypted ? 1 : 0,
                    direction: message.direction,
                    forward: message.forward ? 1 : 0,
                    group: message.group ?? null,
                    mailID: message.mailID,
                    message: encryptedMessage,
                    nonce: message.nonce,
                    readerID: message.readerID,
                    recipient: message.recipient,
                    sender: message.sender,
                    timestamp: message.timestamp,
                })
                .execute();
        } catch (err: unknown) {
            if (this.isDuplicateError(err)) {
                // duplicate nonce — ignore
            } else {
                throw err;
            }
        }
    }

    async savePreKeys(
        preKeys: UnsavedPreKey[],
        oneTime: boolean,
    ): Promise<PreKeysSQL[]> {
        await this.untilReady();
        if (this.closing) {
            return [];
        }

        const table = oneTime ? ("oneTimeKeys" as const) : ("preKeys" as const);
        const saved: PreKeysSQL[] = [];

        for (const preKey of preKeys) {
            const row = await this.db
                .insertInto(table)
                .values({
                    privateKey: this.sealHex(
                        XUtils.encodeHex(preKey.keyPair.secretKey),
                    ),
                    publicKey: XUtils.encodeHex(preKey.keyPair.publicKey),
                    signature: XUtils.encodeHex(preKey.signature),
                })
                .returning([
                    "deviceID",
                    "index",
                    "keyID",
                    "publicKey",
                    "signature",
                    "userID",
                ])
                .executeTakeFirstOrThrow();

            saved.push(row);
        }

        return saved;
    }

    // ── Purge ────────────────────────────────────────────────────────────────

    async saveSession(session: SessionSQL): Promise<void> {
        if (this.closing) {
            return;
        }
        try {
            await this.db
                .insertInto("sessions")
                .values({
                    deviceID: session.deviceID,
                    fingerprint: session.fingerprint,
                    lastUsed: session.lastUsed,
                    mode: session.mode,
                    publicKey: session.publicKey,
                    sessionID: session.sessionID,
                    SK: this.sealHex(session.SK),
                    userID: session.userID,
                    verified: session.verified ? 1 : 0,
                })
                .execute();
        } catch (err: unknown) {
            if (this.isDuplicateError(err)) {
                // duplicate SK — ignore
            } else {
                throw err;
            }
        }
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private decryptMessages(messages: MessageRow[]): Message[] {
        return messages.map((msg): Message => {
            const decryptedFlag = msg.decrypted !== 0;
            let plaintext = msg.message;

            if (decryptedFlag) {
                const decrypted = xSecretboxOpen(
                    XUtils.decodeHex(msg.message),
                    XUtils.decodeHex(msg.nonce),
                    this.idKeys.secretKey,
                );
                if (decrypted) {
                    plaintext = XUtils.encodeUTF8(decrypted);
                } else {
                    throw new Error("Couldn't decrypt messages on disk!");
                }
            }

            const direction =
                msg.direction === "incoming" ? "incoming" : "outgoing";

            return {
                authorID: msg.authorID,
                decrypted: decryptedFlag,
                direction,
                forward: msg.forward !== 0,
                group: msg.group,
                mailID: msg.mailID,
                message: plaintext,
                nonce: msg.nonce,
                readerID: msg.readerID,
                recipient: msg.recipient,
                sender: msg.sender,
                timestamp: msg.timestamp,
            };
        });
    }

    private deviceRowToDevice(row: DeviceRow): Device {
        return {
            deleted: row.deleted !== 0,
            deviceID: row.deviceID,
            lastLogin: row.lastLogin,
            name: row.name,
            owner: row.owner,
            signKey: row.signKey,
        };
    }

    private isDuplicateError(err: unknown): boolean {
        if (err instanceof Error) {
            return err.message.includes("UNIQUE");
        }
        if (typeof err === "object" && err !== null && "errno" in err) {
            return err.errno === 19;
        }
        return false;
    }

    /**
     * Encrypt a hex-encoded secret for at-rest storage.
     * Returns hex(nonce || ciphertext) where nonce is 24 random bytes.
     */
    private sealHex(plainHex: string): string {
        const nonce = xMakeNonce();
        const ct = xSecretbox(
            XUtils.decodeHex(plainHex),
            nonce,
            this.idKeys.secretKey,
        );
        const sealed = new Uint8Array(nonce.length + ct.length);
        sealed.set(nonce);
        sealed.set(ct, nonce.length);
        return XUtils.encodeHex(sealed);
    }

    private sessionRowToSQL(row: SessionRow): SessionSQL {
        return {
            deviceID: row.deviceID,
            fingerprint: row.fingerprint,
            lastUsed: row.lastUsed,
            mode: row.mode === "initiator" ? "initiator" : "receiver",
            publicKey: row.publicKey,
            sessionID: row.sessionID,
            SK: this.unsealHex(row.SK),
            userID: row.userID,
            verified: row.verified !== 0,
        };
    }

    private sqlToCrypto(session: SessionSQL): SessionCrypto {
        return {
            fingerprint: XUtils.decodeHex(session.fingerprint),
            lastUsed: session.lastUsed,
            mode: session.mode,
            publicKey: XUtils.decodeHex(session.publicKey),
            sessionID: session.sessionID,
            SK: XUtils.decodeHex(session.SK),
            userID: session.userID,
        };
    }

    /**
     * Decrypt a value produced by sealHex().
     * Expects hex(nonce || ciphertext), returns the original hex string.
     */
    private unsealHex(sealed: string): string {
        const bytes = XUtils.decodeHex(sealed);
        const nonce = bytes.slice(0, 24);
        const ct = bytes.slice(24);
        const plain = xSecretboxOpen(ct, nonce, this.idKeys.secretKey);
        if (!plain) {
            throw new Error("Failed to decrypt sealed column value.");
        }
        return XUtils.encodeHex(plain);
    }

    private async untilReady(): Promise<void> {
        if (this.ready) return;
        return new Promise((resolve) => {
            const check = () => {
                if (this.ready) {
                    resolve();
                    return;
                }
                setTimeout(check, 10);
            };
            check();
        });
    }
}
