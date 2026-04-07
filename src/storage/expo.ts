/**
 * Expo (React Native) storage factory.
 *
 * Uses the same TauriStorage pattern (raw SQL over an async driver),
 * but backed by expo-sqlite instead of @tauri-apps/plugin-sql.
 *
 * expo-sqlite is an optional peerDependency — only available in Expo apps.
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

type ExpoDatabase = {
    execAsync(sql: string): Promise<void>;
    runAsync(
        sql: string,
        ...params: unknown[]
    ): Promise<{ lastInsertRowId: number; changes: number }>;
    getFirstAsync<T = any>(
        sql: string,
        ...params: unknown[]
    ): Promise<T | null>;
    getAllAsync<T = any>(sql: string, ...params: unknown[]): Promise<T[]>;
    closeAsync(): Promise<void>;
};

async function openDatabase(dbName: string): Promise<ExpoDatabase> {
    const { openDatabaseAsync } = await import("expo-sqlite");
    return openDatabaseAsync(dbName) as unknown as Promise<ExpoDatabase>;
}

export class ExpoStorage extends EventEmitter implements IStorage {
    public ready = false;
    private closing = false;
    private db!: ExpoDatabase;
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
        if (!idKeys) throw new Error("Can't convert SK!");
        this.idKeys = idKeys;
    }

    async init(): Promise<void> {
        try {
            this.db = await openDatabase(this.dbName);
            this.log.info("Opened Expo SQLite: " + this.dbName);

            await this.db.execAsync(`CREATE TABLE IF NOT EXISTS messages (
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

            await this.db.execAsync(`CREATE TABLE IF NOT EXISTS devices (
                deviceID TEXT PRIMARY KEY,
                owner TEXT,
                signKey TEXT,
                name TEXT,
                lastLogin TEXT,
                deleted INTEGER
            )`);

            await this.db.execAsync(`CREATE TABLE IF NOT EXISTS sessions (
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

            await this.db.execAsync(`CREATE TABLE IF NOT EXISTS preKeys (
                "index" INTEGER PRIMARY KEY AUTOINCREMENT,
                keyID TEXT UNIQUE,
                userID TEXT,
                deviceID TEXT,
                privateKey TEXT,
                publicKey TEXT,
                signature TEXT
            )`);

            await this.db.execAsync(`CREATE TABLE IF NOT EXISTS oneTimeKeys (
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
        this.log.info("Closing Expo database.");
        await this.db.closeAsync();
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
            await this.db.runAsync(
                `INSERT INTO messages (nonce, sender, recipient, "group", mailID, message, direction, timestamp, decrypted, forward, authorID, readerID)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        await this.db.runAsync(`DELETE FROM messages WHERE mailID = ?`, mailID);
    }

    async markSessionVerified(sessionID: string): Promise<void> {
        if (this.closing) return;
        await this.db.runAsync(
            `UPDATE sessions SET verified = 1 WHERE sessionID = ?`,
            sessionID,
        );
    }

    async markSessionUsed(sessionID: string): Promise<void> {
        if (this.closing) return;
        await this.db.runAsync(
            `UPDATE sessions SET lastUsed = ? WHERE sessionID = ?`,
            new Date().toISOString(),
            sessionID,
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
        const rows = await this.db.getAllAsync(
            `SELECT * FROM messages
             WHERE (direction = 'incoming' AND authorID = ? AND "group" IS NULL)
                OR (direction = 'outgoing' AND readerID = ? AND "group" IS NULL)
             ORDER BY timestamp ASC`,
            userID,
            userID,
        );
        return this.decryptMessages(rows);
    }

    async getGroupHistory(channelID: string): Promise<IMessage[]> {
        if (this.closing) return [];
        const rows = await this.db.getAllAsync(
            `SELECT * FROM messages WHERE "group" = ? ORDER BY timestamp ASC`,
            channelID,
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
            const result = await this.db.runAsync(
                `INSERT INTO ${table} (privateKey, publicKey, signature) VALUES (?, ?, ?)`,
                XUtils.encodeHex(preKey.keyPair.secretKey),
                XUtils.encodeHex(preKey.keyPair.publicKey),
                XUtils.encodeHex(preKey.signature),
            );
            addedIndexes.push(result.lastInsertRowId);
        }
        const placeholders = addedIndexes.map(() => "?").join(",");
        const rows: IPreKeysSQL[] = await this.db.getAllAsync(
            `SELECT * FROM ${table} WHERE "index" IN (${placeholders})`,
            ...addedIndexes,
        );
        return rows.map((key) => {
            delete key.privateKey;
            return key;
        });
    }

    async getPreKeys(): Promise<IPreKeysCrypto | null> {
        await this.untilReady();
        if (this.closing) return null;
        const pk = await this.db.getFirstAsync<IPreKeysSQL>(
            `SELECT * FROM preKeys`,
        );
        if (!pk || !pk.privateKey) return null;
        return {
            keyPair: nacl.box.keyPair.fromSecretKey(
                XUtils.decodeHex(pk.privateKey),
            ),
            signature: XUtils.decodeHex(pk.signature),
        };
    }

    async getOneTimeKey(index: number): Promise<IPreKeysCrypto | null> {
        await this.untilReady();
        if (this.closing) return null;
        const otk = await this.db.getFirstAsync<IPreKeysSQL>(
            `SELECT * FROM oneTimeKeys WHERE "index" = ?`,
            index,
        );
        if (!otk || !otk.privateKey) return null;
        return {
            keyPair: nacl.box.keyPair.fromSecretKey(
                XUtils.decodeHex(otk.privateKey),
            ),
            signature: XUtils.decodeHex(otk.signature),
            index: otk.index,
        };
    }

    async deleteOneTimeKey(index: number): Promise<void> {
        if (this.closing) return;
        await this.db.runAsync(
            `DELETE FROM oneTimeKeys WHERE "index" = ?`,
            index,
        );
    }

    async getSessionByPublicKey(
        publicKey: Uint8Array,
    ): Promise<ISessionCrypto | null> {
        if (this.closing) return null;
        const hex = XUtils.encodeHex(publicKey);
        const s = await this.db.getFirstAsync<ISessionSQL>(
            `SELECT * FROM sessions WHERE publicKey = ? LIMIT 1`,
            hex,
        );
        if (!s) return null;
        return this.sqlToCrypto(s);
    }

    async getAllSessions(): Promise<ISessionSQL[]> {
        if (this.closing) return [];
        const rows: ISessionSQL[] = await this.db.getAllAsync(
            `SELECT * FROM sessions ORDER BY lastUsed DESC`,
        );
        return rows.map((s) => ({ ...s, verified: Boolean(s.verified) }));
    }

    async getSessionByDeviceID(
        deviceID: string,
    ): Promise<ISessionCrypto | null> {
        if (this.closing) return null;
        const s = await this.db.getFirstAsync<ISessionSQL>(
            `SELECT * FROM sessions WHERE deviceID = ? ORDER BY lastUsed DESC LIMIT 1`,
            deviceID,
        );
        if (!s) return null;
        return this.sqlToCrypto(s);
    }

    async saveSession(session: ISessionSQL): Promise<void> {
        if (this.closing) return;
        try {
            await this.db.runAsync(
                `INSERT INTO sessions (sessionID, userID, deviceID, SK, publicKey, fingerprint, mode, lastUsed, verified)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                session.sessionID,
                session.userID,
                session.deviceID,
                session.SK,
                session.publicKey,
                session.fingerprint,
                session.mode,
                session.lastUsed,
                session.verified ? 1 : 0,
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
        return this.db.getFirstAsync<IDevice>(
            `SELECT * FROM devices WHERE deviceID = ?`,
            deviceID,
        );
    }

    async saveDevice(device: IDevice): Promise<void> {
        if (this.closing) return;
        try {
            await this.db.runAsync(
                `INSERT INTO devices (deviceID, owner, signKey, name, lastLogin, deleted)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                device.deviceID,
                (device as any).owner,
                device.signKey,
                (device as any).name,
                (device as any).lastLogin,
                (device as any).deleted ? 1 : 0,
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
        await this.db.execAsync(`DELETE FROM messages`);
    }

    async purgeKeyData(): Promise<void> {
        await this.db.execAsync(`DELETE FROM sessions`);
        await this.db.execAsync(`DELETE FROM oneTimeKeys`);
        await this.db.execAsync(`DELETE FROM preKeys`);
        await this.db.execAsync(`DELETE FROM messages`);
    }

    async deleteHistory(channelOrUserID: string): Promise<void> {
        await this.db.runAsync(
            `DELETE FROM messages
             WHERE "group" = ? OR ("group" IS NULL AND authorID = ?) OR ("group" IS NULL AND readerID = ?)`,
            channelOrUserID,
            channelOrUserID,
            channelOrUserID,
        );
    }

    private sqlToCrypto(s: ISessionSQL): ISessionCrypto {
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

export async function createExpoStorage(
    dbName: string,
    SK: string,
    logger: ILogger,
): Promise<IStorage> {
    const storage = new ExpoStorage(dbName, SK, logger);
    await storage.init();
    return storage;
}
