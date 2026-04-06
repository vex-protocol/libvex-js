import type {
    IDevice,
    IPreKeysCrypto,
    IPreKeysSQL,
    ISessionCrypto,
} from "@vex-chat/types";
import { EventEmitter } from "events";
import type { IMessage, ISession } from "./index.js";
/**
 * Storage contract used by `Client` for local persistence.
 *
 * Implement this interface when you want to replace the built-in sqlite-backed
 * `Storage` class (for example on mobile, web, or any custom environment).
 *
 * A custom implementation is responsible for:
 * - Persisting encrypted/decrypted message history
 * - Storing device records and cryptographic sessions
 * - Managing prekeys / one-time keys used for session setup
 * - Emitting lifecycle events (`ready`, `error`)
 */
export interface IStorage extends EventEmitter {
    /**
     * Set this to "true" when init has complete.
     */
    ready: boolean;
    /** Closes storage resources (connections, handles, transactions, etc.). */
    close: () => Promise<void>;
    /**
     * Persists one chat message.
     *
     * @example
     * ```ts
     * await storage.saveMessage(message);
     * ```
     */
    saveMessage: (message: IMessage) => Promise<void>;
    /** Deletes one message by `mailID`. */
    deleteMessage: (mailID: string) => Promise<void>;
    /**
     * Marks an encryption session as verified.
     *
     * This usually means the user has compared safety words / fingerprint out
     * of band and confirmed the session.
     */
    markSessionVerified: (sessionID: string) => Promise<void>;
    /** Updates a session's `lastUsed` timestamp to "now". */
    markSessionUsed: (sessionID: string) => Promise<void>;
    /**
     * Returns direct-message history for a user.
     *
     * @example
     * ```ts
     * const history = await storage.getMessageHistory(userID);
     * ```
     */
    getMessageHistory: (userID: string) => Promise<IMessage[]>;
    /** Returns group-message history for a channel. */
    getGroupHistory: (channelID: string) => Promise<IMessage[]>;
    /**
     * Deletes history for a direct conversation or group channel.
     *
     * If `olderThan` is omitted, the full history for that thread is removed.
     *
     * @param channelOrUserID Channel ID or user ID whose history should be deleted.
     * @param olderThan Relative duration such as `1h`, `7d`, or `30m`.
     */
    deleteHistory: (
        channelOrUserID: string,
        olderThan?: string,
    ) => Promise<void>;
    /** Deletes all message history. */
    purgeHistory: () => Promise<void>;
    /** Deletes all local key/session state. */
    purgeKeyData: () => Promise<void>;
    /**
     * Saves signed prekeys.
     *
     * @param preKeys Prekeys to persist.
     * @param oneTime `true` for one-time keys, `false` for the long-lived signed prekey.
     */
    savePreKeys: (
        preKeys: IPreKeysCrypto[],
        oneTime: boolean,
    ) => Promise<IPreKeysSQL[]>;
    /**
     * Returns the local signed prekey pair, or `null` when it has not been created yet.
     */
    getPreKeys: () => Promise<IPreKeysCrypto | null>;
    /** Fetches one one-time key by index. */
    getOneTimeKey: (index: number) => Promise<IPreKeysCrypto | null>;
    /** Deletes one one-time key by index. */
    deleteOneTimeKey: (index: number) => Promise<void>;
    /** Fetches an encryption session using the session public key bytes. */
    getSessionByPublicKey: (
        publicKey: Uint8Array,
    ) => Promise<ISessionCrypto | null>;
    /** Returns all known encryption sessions. */
    getAllSessions: () => Promise<ISession[]>;
    /** Returns the active session for a device ID (typically the most recently used). */
    getSessionByDeviceID: (deviceID: string) => Promise<ISessionCrypto | null>;
    /** Persists an encryption session. */
    saveSession: (session: ISession) => Promise<void>;
    /**
     * Performs storage initialization (schema creation, migrations, warmup, etc.).
     *
     * Implementations should set `ready = true` and emit `ready` after completion.
     */
    init: () => Promise<void>;
    /** Gets one device record by ID. */
    getDevice: (deviceID: string) => Promise<IDevice | null>;
    /** Saves a device record. */
    saveDevice: (device: IDevice) => Promise<void>;

    /**
     * Emit this event when init has complete.
     *
     * @event
     */
    on(event: "ready", callback: () => void): this;
    /**
     * Emit this event if there is an error in opening the database.
     *
     * @event
     */
    on(event: "error", callback: (error: Error) => void): this;
}
