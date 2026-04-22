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
    getCryptoProfile,
    xBoxKeyPairFromSecret,
    xBoxKeyPairFromSecretAsync,
    xMakeNonce,
    xSecretbox,
    xSecretboxAsync,
    xSecretboxOpen,
    xSecretboxOpenAsync,
    XUtils,
} from "@vex-chat/crypto";

import { EventEmitter } from "eventemitter3";

export class SqliteStorage extends EventEmitter implements Storage {
    public ready = false;
    private closing = false;
    /** Shared across concurrent `init()` callers; `close()` awaits it before `destroy()`. */
    private initInFlight: Promise<void> | null = null;
    private readonly db: Kysely<ClientDatabase>;
    /** 32-byte AES-256 (or nacl) key for local at-rest `secretbox` (see `XUtils.deriveLocalAtRestAesKey`). */
    private readonly atRestAesKey: Uint8Array;

    constructor(db: Kysely<ClientDatabase>, atRestAesKey: Uint8Array) {
        super();
        this.db = db;
        if (atRestAesKey.length !== 32) {
            throw new Error("SqliteStorage requires a 32-byte atRestAes key.");
        }
        this.atRestAesKey = atRestAesKey;
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    /**
     * Read `closing` where TypeScript would incorrectly assume it cannot
     * become true after an earlier guard (e.g. across `await`).
     */
    private isClosingNow(): boolean {
        return this.closing;
    }

    async close(): Promise<void> {
        this.closing = true;
        const pending = this.initInFlight;
        if (pending) {
            try {
                await pending;
            } catch {
                // Schema init may have failed; still tear down the driver.
            }
        }
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

        return await Promise.all(rows.map((s) => this.sessionRowToSQLAsync(s)));
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

        return this.decryptMessagesAsync(messages);
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

        return this.decryptMessagesAsync(messages);
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
        const rawSk = await this.unsealHex(otkInfo.privateKey);
        return {
            index: otkInfo.index,
            keyPair:
                getCryptoProfile() === "fips"
                    ? await xBoxKeyPairFromSecretAsync(XUtils.decodeHex(rawSk))
                    : xBoxKeyPairFromSecret(XUtils.decodeHex(rawSk)),
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
        const rawPk = await this.unsealHex(preKeyInfo.privateKey);
        return {
            index: preKeyInfo.index,
            keyPair:
                getCryptoProfile() === "fips"
                    ? await xBoxKeyPairFromSecretAsync(XUtils.decodeHex(rawPk))
                    : xBoxKeyPairFromSecret(XUtils.decodeHex(rawPk)),
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

        return this.sqlToCrypto(await this.sessionRowToSQLAsync(sessionRow));
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

        return this.sqlToCrypto(await this.sessionRowToSQLAsync(sessionRow));
    }

    async init(): Promise<void> {
        if (this.ready || this.closing) {
            return;
        }
        this.initInFlight ??= (async () => {
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
            } finally {
                this.initInFlight = null;
            }
        })();
        await this.initInFlight;
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
        if (this.isClosingNow()) {
            return;
        }

        // Encrypt plaintext with at-rest key before saving to disk
        const fips = getCryptoProfile() === "fips";
        const ct = fips
            ? await xSecretboxAsync(
                  XUtils.decodeUTF8(message.message),
                  XUtils.decodeHex(message.nonce),
                  this.atRestAesKey,
              )
            : xSecretbox(
                  XUtils.decodeUTF8(message.message),
                  XUtils.decodeHex(message.nonce),
                  this.atRestAesKey,
              );
        if (this.isClosingNow()) {
            return;
        }
        const encryptedMessage = XUtils.encodeHex(ct);

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
            } else if (this.isClosingNow() || this.isTornDownError(err)) {
                // e.g. WS/mail still saving after `close()` destroyed the driver
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
                    privateKey: await this.sealHex(
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
                    SK: await this.sealHex(session.SK),
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

    private async decryptMessagesAsync(
        messages: MessageRow[],
    ): Promise<Message[]> {
        const fips = getCryptoProfile() === "fips";
        const out: Message[] = [];
        for (const msg of messages) {
            const decryptedFlag = msg.decrypted !== 0;
            let plaintext = msg.message;
            if (decryptedFlag) {
                const cipher = XUtils.decodeHex(msg.message);
                const nonce = XUtils.decodeHex(msg.nonce);
                const decrypted = fips
                    ? await xSecretboxOpenAsync(
                          cipher,
                          nonce,
                          this.atRestAesKey,
                      )
                    : xSecretboxOpen(cipher, nonce, this.atRestAesKey);
                if (decrypted) {
                    plaintext = XUtils.encodeUTF8(decrypted);
                } else {
                    throw new Error("Couldn't decrypt messages on disk!");
                }
            }
            const direction =
                msg.direction === "incoming" ? "incoming" : "outgoing";
            out.push({
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
            });
        }
        return out;
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
     * After `close` runs, Kysely / better-sqlite3 can reject with this if a
     * message handler is still in flight.
     */
    private isTornDownError(err: unknown): boolean {
        if (err instanceof Error) {
            const m = err.message.toLowerCase();
            return (
                m.includes("driver has already been destroyed") ||
                m.includes("connection is not open") ||
                m.includes("database is closed")
            );
        }
        return false;
    }

    /**
     * Encrypt a hex-encoded secret for at-rest storage.
     * Returns hex(nonce || ciphertext) where nonce is 24 random bytes.
     */
    private async sealHex(plainHex: string): Promise<string> {
        const nonce = xMakeNonce();
        const fips = getCryptoProfile() === "fips";
        const ct = fips
            ? await xSecretboxAsync(
                  XUtils.decodeHex(plainHex),
                  nonce,
                  this.atRestAesKey,
              )
            : xSecretbox(XUtils.decodeHex(plainHex), nonce, this.atRestAesKey);
        const sealed = new Uint8Array(nonce.length + ct.length);
        sealed.set(nonce);
        sealed.set(ct, nonce.length);
        return XUtils.encodeHex(sealed);
    }

    private async sessionRowToSQLAsync(row: SessionRow): Promise<SessionSQL> {
        return {
            deviceID: row.deviceID,
            fingerprint: row.fingerprint,
            lastUsed: row.lastUsed,
            mode: row.mode === "initiator" ? "initiator" : "receiver",
            publicKey: row.publicKey,
            sessionID: row.sessionID,
            SK: await this.unsealHex(row.SK),
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
    private async unsealHex(sealed: string): Promise<string> {
        const bytes = XUtils.decodeHex(sealed);
        const nonce = bytes.slice(0, 24);
        const ct = bytes.slice(24);
        const fips = getCryptoProfile() === "fips";
        const plain = fips
            ? await xSecretboxOpenAsync(ct, nonce, this.atRestAesKey)
            : xSecretboxOpen(ct, nonce, this.atRestAesKey);
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
