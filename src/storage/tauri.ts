/**
 * IStorage implementation for Tauri using @tauri-apps/plugin-sql.
 *
 * This is a direct port of the knex/better-sqlite3 Storage class,
 * rewritten against the Tauri SQL plugin's async API.
 *
 * @tauri-apps/plugin-sql is a peerDependency — only available inside a Tauri app.
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
import nacl from "tweetnacl";
import type { IMessage } from "../index.js";
import type { IStorage } from "../IStorage.js";
import type { ILogger } from "../transport/types.js";

// Dynamic import at runtime — only resolves inside a Tauri webview.
type TauriDatabase = {
    execute(
        sql: string,
        bindValues?: unknown[],
    ): Promise<{ rowsAffected: number; lastInsertId: number }>;
    select<T = any>(sql: string, bindValues?: unknown[]): Promise<T[]>;
    close(): Promise<void>;
};

async function openDatabase(dbName: string): Promise<TauriDatabase> {
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    return Database.load(
        `sqlite:${dbName}`,
    ) as unknown as Promise<TauriDatabase>;
}

export class TauriStorage extends EventEmitter implements IStorage {
    public ready = false;
    private closing = false;
    private db!: TauriDatabase;
    private dbName: string;
    private log: ILogger;
    private idKeys: nacl.BoxKeyPair;

    constructor(dbName: string, SK: string, logger: ILogger) {
        super();
        this.dbName = dbName;
        this.log = logger;

        const idKeys = XKeyConvert.convertKeyPair(
            nacl.sign.keyPair.fromSecretKey(XUtils.decodeHex(SK)),
        );
        if (!idKeys) {
            throw new Error("Can't convert SK!");
        }
        this.idKeys = idKeys;
    }

    async init(): Promise<void> {
        try {
            this.db = await openDatabase(this.dbName);
            this.log.info("Opened Tauri SQLite: " + this.dbName);

            await this.db.execute(`CREATE TABLE IF NOT EXISTS messages (
                nonce TEXT PRIMARY KEY,
                sender TEXT,
                recipient TEXT,
                "group" TEXT,
                mailID TEXT,
                message TEXT,
                direction TEXT,
                timestamp TEXT,
                decrypted INTEGER,
                forward INTEGER,
                authorID TEXT,
                readerID TEXT
            )`);

            await this.db.execute(
                `CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender)`,
            );
            await this.db.execute(
                `CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient)`,
            );
            await this.db.execute(
                `CREATE INDEX IF NOT EXISTS idx_messages_group ON messages("group")`,
            );

            await this.db.execute(`CREATE TABLE IF NOT EXISTS devices (
                deviceID TEXT PRIMARY KEY,
                owner TEXT,
                signKey TEXT,
                name TEXT,
                lastLogin TEXT,
                deleted INTEGER
            )`);

            await this.db.execute(`CREATE TABLE IF NOT EXISTS sessions (
                sessionID TEXT PRIMARY KEY,
                userID TEXT,
                deviceID TEXT,
                SK TEXT UNIQUE,
                publicKey TEXT,
                fingerprint TEXT,
                mode TEXT,
                lastUsed TEXT,
                verified INTEGER
            )`);

            await this.db.execute(`CREATE TABLE IF NOT EXISTS preKeys (
                "index" INTEGER PRIMARY KEY AUTOINCREMENT,
                keyID TEXT UNIQUE,
                userID TEXT,
                deviceID TEXT,
                privateKey TEXT,
                publicKey TEXT,
                signature TEXT
            )`);

            await this.db.execute(`CREATE TABLE IF NOT EXISTS oneTimeKeys (
                "index" INTEGER PRIMARY KEY AUTOINCREMENT,
                keyID TEXT UNIQUE,
                userID TEXT,
                deviceID TEXT,
                privateKey TEXT,
                publicKey TEXT,
                signature TEXT
            )`);

            this.ready = true;
            this.emit("ready");
        } catch (err) {
            this.emit("error", err);
        }
    }

    async close(): Promise<void> {
        this.closing = true;
        this.log.info("Closing Tauri database.");
        await this.db.close();
    }

    async saveMessage(message: IMessage): Promise<void> {
        if (this.closing) return;

        const copy = { ...message };
        copy.message = XUtils.encodeHex(
            nacl.secretbox(
                XUtils.decodeUTF8(message.message),
                XUtils.decodeHex(message.nonce),
                this.idKeys.secretKey,
            ),
        );

        try {
            await this.db.execute(
                `INSERT INTO messages (nonce, sender, recipient, "group", mailID, message, direction, timestamp, decrypted, forward, authorID, readerID)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                [
                    copy.nonce,
                    copy.sender,
                    copy.recipient,
                    copy.group ?? null,
                    copy.mailID,
                    copy.message,
                    copy.direction,
                    copy.timestamp instanceof Date
                        ? copy.timestamp.toISOString()
                        : copy.timestamp,
                    copy.decrypted ? 1 : 0,
                    copy.forward ? 1 : 0,
                    copy.authorID,
                    copy.readerID,
                ],
            );
        } catch (err: any) {
            if (err?.message?.includes("UNIQUE")) {
                this.log.warn(
                    "Attempted to insert duplicate nonce into message table.",
                );
            } else {
                throw err;
            }
        }
    }

    async deleteMessage(mailID: string): Promise<void> {
        if (this.closing) return;
        await this.db.execute(`DELETE FROM messages WHERE mailID = $1`, [
            mailID,
        ]);
    }

    async markSessionVerified(sessionID: string): Promise<void> {
        if (this.closing) return;
        await this.db.execute(
            `UPDATE sessions SET verified = 1 WHERE sessionID = $1`,
            [sessionID],
        );
    }

    async markSessionUsed(sessionID: string): Promise<void> {
        if (this.closing) return;
        await this.db.execute(
            `UPDATE sessions SET lastUsed = $1 WHERE sessionID = $2`,
            [new Date().toISOString(), sessionID],
        );
    }

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

    async getMessageHistory(userID: string): Promise<IMessage[]> {
        if (this.closing) return [];
        const rows = await this.db.select(
            `SELECT * FROM messages
             WHERE (direction = 'incoming' AND authorID = $1 AND "group" IS NULL)
                OR (direction = 'outgoing' AND readerID = $1 AND "group" IS NULL)
             ORDER BY timestamp ASC`,
            [userID],
        );
        return this.decryptMessages(rows);
    }

    async getGroupHistory(channelID: string): Promise<IMessage[]> {
        if (this.closing) return [];
        const rows = await this.db.select(
            `SELECT * FROM messages WHERE "group" = $1 ORDER BY timestamp ASC`,
            [channelID],
        );
        return this.decryptMessages(rows);
    }

    async savePreKeys(
        preKeys: IPreKeysCrypto[],
        oneTime: boolean,
    ): Promise<IPreKeysSQL[]> {
        await this.untilReady();
        if (this.closing) return [];

        const table = oneTime ? "oneTimeKeys" : "preKeys";
        const addedIndexes: number[] = [];

        for (const preKey of preKeys) {
            const result = await this.db.execute(
                `INSERT INTO ${table} (privateKey, publicKey, signature) VALUES ($1, $2, $3)`,
                [
                    XUtils.encodeHex(preKey.keyPair.secretKey),
                    XUtils.encodeHex(preKey.keyPair.publicKey),
                    XUtils.encodeHex(preKey.signature),
                ],
            );
            addedIndexes.push(result.lastInsertId);
        }

        const placeholders = addedIndexes.map((_, i) => `$${i + 1}`).join(",");
        const rows: IPreKeysSQL[] = await this.db.select(
            `SELECT * FROM ${table} WHERE "index" IN (${placeholders})`,
            addedIndexes,
        );
        return rows.map((key) => {
            delete key.privateKey;
            return key;
        });
    }

    async getPreKeys(): Promise<IPreKeysCrypto | null> {
        await this.untilReady();
        if (this.closing) return null;
        const rows: IPreKeysSQL[] = await this.db.select(
            `SELECT * FROM preKeys`,
        );
        if (rows.length === 0) return null;
        const pk = rows[0];
        return {
            keyPair: nacl.box.keyPair.fromSecretKey(
                XUtils.decodeHex(pk.privateKey!),
            ),
            signature: XUtils.decodeHex(pk.signature),
        };
    }

    async getOneTimeKey(index: number): Promise<IPreKeysCrypto | null> {
        await this.untilReady();
        if (this.closing) return null;
        const rows: IPreKeysSQL[] = await this.db.select(
            `SELECT * FROM oneTimeKeys WHERE "index" = $1`,
            [index],
        );
        if (rows.length === 0) return null;
        const otk = rows[0];
        return {
            keyPair: nacl.box.keyPair.fromSecretKey(
                XUtils.decodeHex(otk.privateKey!),
            ),
            signature: XUtils.decodeHex(otk.signature),
            index: otk.index,
        };
    }

    async deleteOneTimeKey(index: number): Promise<void> {
        if (this.closing) return;
        await this.db.execute(`DELETE FROM oneTimeKeys WHERE "index" = $1`, [
            index,
        ]);
    }

    async getSessionByPublicKey(
        publicKey: Uint8Array,
    ): Promise<ISessionCrypto | null> {
        if (this.closing) return null;
        const hex = XUtils.encodeHex(publicKey);
        const rows: ISessionSQL[] = await this.db.select(
            `SELECT * FROM sessions WHERE publicKey = $1 LIMIT 1`,
            [hex],
        );
        if (rows.length === 0) return null;
        const s = rows[0];
        return {
            sessionID: s.sessionID,
            userID: s.userID,
            mode: s.mode,
            SK: XUtils.decodeHex(s.SK),
            publicKey: XUtils.decodeHex(s.publicKey),
            lastUsed: s.lastUsed,
            fingerprint: XUtils.decodeHex(s.fingerprint),
        };
    }

    async getAllSessions(): Promise<ISessionSQL[]> {
        if (this.closing) return [];
        const rows: ISessionSQL[] = await this.db.select(
            `SELECT * FROM sessions ORDER BY lastUsed DESC`,
        );
        return rows.map((s) => ({ ...s, verified: Boolean(s.verified) }));
    }

    async getSessionByDeviceID(
        deviceID: string,
    ): Promise<ISessionCrypto | null> {
        if (this.closing) return null;
        const rows: ISessionSQL[] = await this.db.select(
            `SELECT * FROM sessions WHERE deviceID = $1 ORDER BY lastUsed DESC LIMIT 1`,
            [deviceID],
        );
        if (rows.length === 0) return null;
        const s = rows[0];
        return {
            sessionID: s.sessionID,
            userID: s.userID,
            mode: s.mode,
            SK: XUtils.decodeHex(s.SK),
            publicKey: XUtils.decodeHex(s.publicKey),
            lastUsed: s.lastUsed,
            fingerprint: XUtils.decodeHex(s.fingerprint),
        };
    }

    async saveSession(session: ISessionSQL): Promise<void> {
        if (this.closing) return;
        try {
            await this.db.execute(
                `INSERT INTO sessions (sessionID, userID, deviceID, SK, publicKey, fingerprint, mode, lastUsed, verified)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    session.sessionID,
                    session.userID,
                    session.deviceID,
                    session.SK,
                    session.publicKey,
                    session.fingerprint,
                    session.mode,
                    session.lastUsed,
                    session.verified ? 1 : 0,
                ],
            );
        } catch (err: any) {
            if (err?.message?.includes("UNIQUE")) {
                this.log.warn("Attempted to insert duplicate SK");
            } else {
                throw err;
            }
        }
    }

    async getDevice(deviceID: string): Promise<IDevice | null> {
        const rows = await this.db.select(
            `SELECT * FROM devices WHERE deviceID = $1`,
            [deviceID],
        );
        return rows.length > 0 ? rows[0] : null;
    }

    async saveDevice(device: IDevice): Promise<void> {
        if (this.closing) return;
        try {
            await this.db.execute(
                `INSERT INTO devices (deviceID, owner, signKey, name, lastLogin, deleted)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    device.deviceID,
                    (device as any).owner,
                    device.signKey,
                    (device as any).name,
                    (device as any).lastLogin,
                    (device as any).deleted ? 1 : 0,
                ],
            );
        } catch (err: any) {
            if (err?.message?.includes("UNIQUE")) {
                this.log.warn("Attempted to insert duplicate deviceID");
            } else {
                throw err;
            }
        }
    }

    async purgeHistory(): Promise<void> {
        await this.db.execute(`DELETE FROM messages`);
    }

    async purgeKeyData(): Promise<void> {
        await this.db.execute(`DELETE FROM sessions`);
        await this.db.execute(`DELETE FROM oneTimeKeys`);
        await this.db.execute(`DELETE FROM preKeys`);
        await this.db.execute(`DELETE FROM messages`);
    }

    async deleteHistory(
        channelOrUserID: string,
        _olderThan?: string,
    ): Promise<void> {
        await this.db.execute(
            `DELETE FROM messages
             WHERE "group" = $1
                OR ("group" IS NULL AND authorID = $1)
                OR ("group" IS NULL AND readerID = $1)`,
            [channelOrUserID],
        );
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
