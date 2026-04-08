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
import { XKeyConvert, XUtils } from "@vex-chat/crypto";
import type {
    IDevice,
    IPreKeysCrypto,
    IPreKeysSQL,
    ISessionCrypto,
    ISessionSQL,
} from "@vex-chat/types";
import { EventEmitter } from "eventemitter3";
import type { Kysely } from "kysely";
import nacl from "tweetnacl";
import type { IMessage } from "../index.js";
import type { IStorage } from "../IStorage.js";
import type { ILogger } from "../transport/types.js";
import type { ClientDatabase } from "./schema.js";

export class SqliteStorage extends EventEmitter implements IStorage {
    public ready = false;
    private closing = false;
    private db: Kysely<ClientDatabase>;
    private log: ILogger;
    private idKeys: nacl.BoxKeyPair;

    constructor(db: Kysely<ClientDatabase>, SK: string, logger: ILogger) {
        super();
        this.db = db;
        this.log = logger;

        const idKeys = XKeyConvert.convertKeyPair(
            nacl.sign.keyPair.fromSecretKey(XUtils.decodeHex(SK)),
        );
        if (!idKeys) {
            throw new Error("Can't convert SK!");
        }
        this.idKeys = idKeys;
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    async init(): Promise<void> {
        this.log.info("Initializing database tables.");
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
        } catch (err) {
            this.emit("error", err);
        }
    }

    async close(): Promise<void> {
        this.closing = true;
        this.log.info("Closing database.");
        await this.db.destroy();
    }

    // ── Messages ─────────────────────────────────────────────────────────────

    async saveMessage(message: IMessage): Promise<void> {
        if (this.closing) {
            this.log.warn(
                "Database is closing, saveMessage() will not complete.",
            );
            return;
        }

        // Encrypt plaintext with our idkey before saving to disk
        const encryptedMessage = XUtils.encodeHex(
            nacl.secretbox(
                XUtils.decodeUTF8(message.message),
                XUtils.decodeHex(message.nonce),
                this.idKeys.secretKey,
            ),
        );

        try {
            await this.db
                .insertInto("messages")
                .values({
                    nonce: message.nonce,
                    sender: message.sender,
                    recipient: message.recipient,
                    group: message.group ?? null,
                    mailID: message.mailID,
                    message: encryptedMessage,
                    direction: message.direction,
                    timestamp:
                        message.timestamp instanceof Date
                            ? message.timestamp.toISOString()
                            : String(message.timestamp),
                    decrypted: message.decrypted ? 1 : 0,
                    forward: message.forward ? 1 : 0,
                    authorID: message.authorID,
                    readerID: message.readerID,
                })
                .execute();
        } catch (err: any) {
            if (this.closing) return;
            if (err?.errno === 19 || err?.message?.includes("UNIQUE")) {
                this.log.warn("Duplicate nonce in message table.");
            } else {
                throw err;
            }
        }
    }

    async deleteMessage(mailID: string): Promise<void> {
        if (this.closing) {
            this.log.warn(
                "Database is closing, deleteMessage() will not complete.",
            );
            return;
        }
        await this.db
            .deleteFrom("messages")
            .where("mailID", "=", mailID)
            .execute();
    }

    async getMessageHistory(userID: string): Promise<IMessage[]> {
        if (this.closing) {
            this.log.warn(
                "Database is closing, getMessageHistory() will not complete.",
            );
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

    async getGroupHistory(channelID: string): Promise<IMessage[]> {
        if (this.closing) {
            this.log.warn(
                "Database is closing, getGroupHistory() will not complete.",
            );
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

    async deleteHistory(
        channelOrUserID: string,
        _olderThan?: string,
    ): Promise<void> {
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

    async purgeHistory(): Promise<void> {
        await this.db.deleteFrom("messages").execute();
    }

    // ── Sessions ─────────────────────────────────────────────────────────────

    async markSessionVerified(sessionID: string): Promise<void> {
        if (this.closing) {
            this.log.warn(
                "Database is closing, markSessionVerified() will not complete.",
            );
            return;
        }
        await this.db
            .updateTable("sessions")
            .set({ verified: 1 })
            .where("sessionID", "=", sessionID)
            .execute();
    }

    async markSessionUsed(sessionID: string): Promise<void> {
        if (this.closing) {
            this.log.warn(
                "Database is closing, markSessionUsed() will not complete.",
            );
            return;
        }
        await this.db
            .updateTable("sessions")
            .set({ lastUsed: new Date(Date.now()).toISOString() })
            .where("sessionID", "=", sessionID)
            .execute();
    }

    async getSessionByPublicKey(
        publicKey: Uint8Array,
    ): Promise<ISessionCrypto | null> {
        if (this.closing) {
            this.log.warn(
                "Database is closing, getSessionByPublicKey() will not complete.",
            );
            return null;
        }
        const hex = XUtils.encodeHex(publicKey);

        const rows = await this.db
            .selectFrom("sessions")
            .selectAll()
            .where("publicKey", "=", hex)
            .limit(1)
            .execute();

        if (rows.length === 0) {
            this.log.warn(
                `getSessionByPublicKey(${hex}) => ${JSON.stringify(null)}`,
            );
            return null;
        }

        return this.sqlToCrypto(rows[0] as unknown as ISessionSQL);
    }

    async getAllSessions(): Promise<ISessionSQL[]> {
        if (this.closing) {
            this.log.warn(
                "Database is closing, getAllSessions() will not complete.",
            );
            return [];
        }
        const rows = await this.db
            .selectFrom("sessions")
            .selectAll()
            .orderBy("lastUsed", "desc")
            .execute();

        return rows.map((s) => ({
            ...(s as unknown as ISessionSQL),
            verified: Boolean(s.verified),
        }));
    }

    async getSessionByDeviceID(
        deviceID: string,
    ): Promise<ISessionCrypto | null> {
        if (this.closing) {
            this.log.warn(
                "Database is closing, getSessionByDeviceID() will not complete.",
            );
            return null;
        }
        const rows = await this.db
            .selectFrom("sessions")
            .selectAll()
            .where("deviceID", "=", deviceID)
            .orderBy("lastUsed", "desc")
            .limit(1)
            .execute();

        if (rows.length === 0) {
            this.log.debug("getSession() => " + JSON.stringify(null));
            return null;
        }

        return this.sqlToCrypto(rows[0] as unknown as ISessionSQL);
    }

    async saveSession(session: ISessionSQL): Promise<void> {
        if (this.closing) {
            this.log.warn(
                "Database is closing, saveSession() will not complete.",
            );
            return;
        }
        try {
            await this.db
                .insertInto("sessions")
                .values({
                    sessionID: session.sessionID,
                    userID: session.userID,
                    deviceID: session.deviceID,
                    SK: session.SK,
                    publicKey: session.publicKey,
                    fingerprint: session.fingerprint,
                    mode: session.mode,
                    lastUsed:
                        session.lastUsed instanceof Date
                            ? session.lastUsed.toISOString()
                            : String(session.lastUsed),
                    verified: session.verified ? 1 : 0,
                })
                .execute();
        } catch (err: any) {
            if (err?.errno === 19 || err?.message?.includes("UNIQUE")) {
                this.log.warn("Attempted to insert duplicate SK");
            } else {
                throw err;
            }
        }
    }

    // ── PreKeys / OneTimeKeys ────────────────────────────────────────────────

    async savePreKeys(
        preKeys: IPreKeysCrypto[],
        oneTime: boolean,
    ): Promise<IPreKeysSQL[]> {
        await this.untilReady();
        if (this.closing) {
            this.log.warn(
                "Database is closing, savePreKeys() will not complete.",
            );
            return [];
        }

        const table = oneTime ? ("oneTimeKeys" as const) : ("preKeys" as const);
        const addedIndexes: number[] = [];

        for (const preKey of preKeys) {
            const result = await this.db
                .insertInto(table)
                .values({
                    privateKey: XUtils.encodeHex(preKey.keyPair.secretKey),
                    publicKey: XUtils.encodeHex(preKey.keyPair.publicKey),
                    signature: XUtils.encodeHex(preKey.signature),
                } as any)
                .executeTakeFirst();
            if (result.insertId !== undefined) {
                addedIndexes.push(Number(result.insertId));
            }
        }

        const rows = await this.db
            .selectFrom(table)
            .selectAll()
            .where("index", "in", addedIndexes)
            .execute();

        return (rows as unknown as IPreKeysSQL[]).map((key) => {
            delete key.privateKey;
            return key;
        });
    }

    async getPreKeys(): Promise<IPreKeysCrypto | null> {
        await this.untilReady();
        if (this.closing) {
            this.log.warn(
                "Database is closing, getPreKeys() will not complete.",
            );
            return null;
        }

        const rows = await this.db.selectFrom("preKeys").selectAll().execute();

        if (rows.length === 0) {
            this.log.debug("getPreKeys() => " + JSON.stringify(null));
            return null;
        }

        const preKeyInfo = rows[0];
        return {
            keyPair: nacl.box.keyPair.fromSecretKey(
                XUtils.decodeHex(preKeyInfo.privateKey),
            ),
            signature: XUtils.decodeHex(preKeyInfo.signature),
        };
    }

    async getOneTimeKey(index: number): Promise<IPreKeysCrypto | null> {
        await this.untilReady();
        if (this.closing) {
            this.log.warn(
                "Database is closing, getOneTimeKey() will not complete.",
            );
            return null;
        }

        const rows = await this.db
            .selectFrom("oneTimeKeys")
            .selectAll()
            .where("index", "=", index)
            .execute();

        if (rows.length === 0) {
            this.log.debug("getOneTimeKey() => " + JSON.stringify(null));
            return null;
        }

        const otkInfo = rows[0];
        return {
            keyPair: nacl.box.keyPair.fromSecretKey(
                XUtils.decodeHex(otkInfo.privateKey),
            ),
            signature: XUtils.decodeHex(otkInfo.signature),
            index: otkInfo.index as number,
        };
    }

    async deleteOneTimeKey(index: number): Promise<void> {
        if (this.closing) {
            this.log.warn(
                "Database is closing, deleteOneTimeKey() will not complete.",
            );
            return;
        }
        await this.db
            .deleteFrom("oneTimeKeys")
            .where("index", "=", index)
            .execute();
    }

    // ── Devices ──────────────────────────────────────────────────────────────

    async getDevice(deviceID: string): Promise<IDevice | null> {
        const rows = await this.db
            .selectFrom("devices")
            .selectAll()
            .where("deviceID", "=", deviceID)
            .execute();

        if (rows.length === 0) {
            return null;
        }
        return rows[0] as unknown as IDevice;
    }

    async saveDevice(device: IDevice): Promise<void> {
        if (this.closing) {
            this.log.warn(
                "Database is closing, saveDevice() will not complete.",
            );
            return;
        }
        try {
            await this.db
                .insertInto("devices")
                .values({
                    deviceID: device.deviceID,
                    owner: (device as any).owner,
                    signKey: device.signKey,
                    name: (device as any).name,
                    lastLogin: (device as any).lastLogin,
                    deleted: (device as any).deleted ? 1 : 0,
                })
                .execute();
        } catch (err: any) {
            if (err?.errno === 19 || err?.message?.includes("UNIQUE")) {
                this.log.warn("Attempted to insert duplicate deviceID");
            } else {
                throw err;
            }
        }
    }

    // ── Purge ────────────────────────────────────────────────────────────────

    async purgeKeyData(): Promise<void> {
        await this.db.deleteFrom("sessions").execute();
        await this.db.deleteFrom("oneTimeKeys").execute();
        await this.db.deleteFrom("preKeys").execute();
        await this.db.deleteFrom("messages").execute();
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private decryptMessages(messages: any[]): IMessage[] {
        return messages.map((msg) => {
            msg.timestamp = new Date(msg.timestamp);
            msg.decrypted = Boolean(msg.decrypted);
            msg.forward = Boolean(msg.forward);

            if (msg.decrypted) {
                const decrypted = nacl.secretbox.open(
                    XUtils.decodeHex(msg.message),
                    XUtils.decodeHex(msg.nonce),
                    this.idKeys.secretKey,
                );
                if (decrypted) {
                    msg.message = XUtils.encodeUTF8(decrypted);
                } else {
                    throw new Error("Couldn't decrypt messages on disk!");
                }
            }
            return msg as IMessage;
        });
    }

    private sqlToCrypto(session: ISessionSQL): ISessionCrypto {
        return {
            sessionID: session.sessionID,
            userID: session.userID,
            mode: session.mode,
            SK: XUtils.decodeHex(session.SK),
            publicKey: XUtils.decodeHex(session.publicKey),
            lastUsed: session.lastUsed,
            fingerprint: XUtils.decodeHex(session.fingerprint),
        };
    }

    private async untilReady(): Promise<void> {
        if (this.ready) return;
        return new Promise((resolve) => {
            const check = () => {
                if (this.ready) return resolve();
                setTimeout(check, 10);
            };
            check();
        });
    }
}
