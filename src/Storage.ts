import type { Message, Session } from "./index.js";
import type { PreKeysCrypto, SessionCrypto, UnsavedPreKey } from "./types/index.js";
import type { Device, PreKeysSQL } from "@vex-chat/types";
import type { EventEmitter } from "eventemitter3";
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
export interface Storage extends EventEmitter {
    /** Closes storage resources (connections, handles, transactions, etc.). */
    close: () => Promise<void>;
    /**
     * Deletes history for a direct conversation or group channel.
     *
     * @param channelOrUserID Channel ID or user ID whose history should be deleted.
     */
    deleteHistory: (channelOrUserID: string) => Promise<void>;
    /** Deletes one message by `mailID`. */
    deleteMessage: (mailID: string) => Promise<void>;
    /** Deletes one one-time key by index. */
    deleteOneTimeKey: (index: number) => Promise<void>;
    /** Returns all known encryption sessions. */
    getAllSessions: () => Promise<Session[]>;
    /** Gets one device record by ID. */
    getDevice: (deviceID: string) => Promise<Device | null>;
    /** Returns group-message history for a channel. */
    getGroupHistory: (channelID: string) => Promise<Message[]>;
    /**
     * Returns direct-message history for a user.
     *
     * @example
     * ```ts
     * const history = await storage.getMessageHistory(userID);
     * ```
     */
    getMessageHistory: (userID: string) => Promise<Message[]>;
    /** Fetches one one-time key by index. */
    getOneTimeKey: (index: number) => Promise<null | PreKeysCrypto>;
    /**
     * Returns the local signed prekey pair, or `null` when it has not been created yet.
     */
    getPreKeys: () => Promise<null | PreKeysCrypto>;
    /** Returns the active session for a device ID (typically the most recently used). */
    getSessionByDeviceID: (deviceID: string) => Promise<null | SessionCrypto>;
    /** Fetches an encryption session using the session public key bytes. */
    getSessionByPublicKey: (
        publicKey: Uint8Array,
    ) => Promise<null | SessionCrypto>;
    /**
     * Performs storage initialization (schema creation, migrations, warmup, etc.).
     *
     * Implementations should set `ready = true` and emit `ready` after completion.
     */
    init: () => Promise<void>;
    /** Updates a session's `lastUsed` timestamp to "now". */
    markSessionUsed: (sessionID: string) => Promise<void>;
    /**
     * Marks an encryption session as verified.
     *
     * This usually means the user has compared safety words / fingerprint out
     * of band and confirmed the session.
     */
    markSessionVerified: (sessionID: string) => Promise<void>;
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
    /** Deletes all message history. */
    purgeHistory: () => Promise<void>;
    /** Deletes all local key/session state. */
    purgeKeyData: () => Promise<void>;
    /**
     * Set this to "true" when init has complete.
     */
    ready: boolean;
    /** Saves a device record. */
    saveDevice: (device: Device) => Promise<void>;
    /**
     * Persists one chat message.
     *
     * @example
     * ```ts
     * await storage.saveMessage(message);
     * ```
     */
    saveMessage: (message: Message) => Promise<void>;

    /**
     * Saves signed prekeys.
     *
     * @param preKeys Prekeys to persist.
     * @param oneTime `true` for one-time keys, `false` for the long-lived signed prekey.
     */
    savePreKeys: (
        preKeys: UnsavedPreKey[],
        oneTime: boolean,
    ) => Promise<PreKeysSQL[]>;
    /** Persists an encryption session. */
    saveSession: (session: Session) => Promise<void>;
}
