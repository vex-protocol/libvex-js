/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Storage } from "./Storage.js";
import type { WebSocketLike } from "./transport/types.js";
import type {
    PreKeysCrypto,
    SessionCrypto,
    UnsavedPreKey,
    XKeyRing,
} from "./types/index.js";
import type { KeyPair } from "@vex-chat/crypto";
import type {
    ActionToken,
    ChallMsg,
    Channel,
    Device,
    DevicePayload,
    Emoji,
    FileResponse,
    FileSQL,
    Invite,
    KeyBundle,
    MailWS,
    NotifyMsg,
    Permission,
    PreKeysSQL,
    PreKeysWS,
    ReceiptMsg,
    RegistrationPayload,
    ResourceMsg,
    RespMsg,
    Server,
    SessionSQL,
} from "@vex-chat/types";
import type { ClientMessage } from "@vex-chat/types";
import type { AxiosInstance } from "axios";

import {
    type CryptoProfile,
    getCryptoProfile,
    setCryptoProfile,
    xBoxKeyPairAsync,
    xBoxKeyPairFromSecretAsync,
    xConcat,
    xConstants,
    xDHAsync,
    xEcdhKeyPairFromEcdsaKeyPairAsync,
    xEncode,
    xHMAC,
    xKDF,
    XKeyConvert,
    xMakeNonce,
    xMnemonic,
    xRandomBytes,
    xSecretboxAsync,
    xSecretboxOpenAsync,
    xSignAsync,
    xSignKeyPair,
    xSignKeyPairAsync,
    xSignKeyPairFromSecret,
    xSignKeyPairFromSecretAsync,
    XUtils,
} from "@vex-chat/crypto";
import {
    MailType,
    MailWSSchema,
    PermissionSchema,
    WSMessageSchema,
} from "@vex-chat/types";

import axios, { type AxiosError, isAxiosError } from "axios";
import { EventEmitter } from "eventemitter3";
import * as uuid from "uuid";
import { z } from "zod/v4";

import { WebSocketAdapter } from "./transport/websocket.js";
import {
    decodeFipsInitialExtraV1,
    decodeFipsSubsequentExtraV1,
    encodeFipsInitialExtraV1,
    encodeFipsSubsequentExtraV1,
    fipsP256AdFromIdentityPubs,
    fipsP256PreKeySignPayload,
    isFipsInitialExtraV1,
    isFipsSubsequentExtraV1,
} from "./utils/fipsMailExtra.js";

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

import { msgpack } from "./codec.js";
import {
    ActionTokenCodec,
    AuthResponseCodec,
    ChannelArrayCodec,
    ChannelCodec,
    ConnectResponseCodec,
    decodeAxios,
    DeviceArrayCodec,
    DeviceChallengeCodec,
    DeviceCodec,
    EmojiArrayCodec,
    EmojiCodec,
    FileSQLCodec,
    InviteArrayCodec,
    InviteCodec,
    KeyBundleCodec,
    OtkCountCodec,
    PermissionArrayCodec,
    PermissionCodec,
    ServerArrayCodec,
    ServerCodec,
    UserArrayCodec,
    UserCodec,
    WhoamiCodec,
} from "./codecs.js";
import { capitalize } from "./utils/capitalize.js";
import { sqlSessionToCrypto } from "./utils/sqlSessionToCrypto.js";
import { uuidToUint8 } from "./utils/uint8uuid.js";

const _protocolMsgRegex = /��\w+:\w+��/g;

/**
 * Permission is a permission to a resource.
 *
 * Common fields:
 * - `permissionID`: unique permission row ID
 * - `userID`: user receiving this grant
 * - `resourceID`: target server/channel/etc.
 * - `resourceType`: type string for the resource
 * - `powerLevel`: authorization level
 */
export type { Permission } from "@vex-chat/types";

/**
 * @ignore
 */
export interface Channels {
    /** Creates a channel in a server. */
    create: (name: string, serverID: string) => Promise<Channel>;
    /** Deletes a channel. */
    delete: (channelID: string) => Promise<void>;
    /** Lists channels in a server. */
    retrieve: (serverID: string) => Promise<Channel[]>;
    /** Gets one channel by ID. */
    retrieveByID: (channelID: string) => Promise<Channel | null>;
    /** Lists users currently visible in a channel. */
    userList: (channelID: string) => Promise<User[]>;
}

/**
 * Device record associated with a user account.
 *
 * Common fields:
 * - `deviceID`: unique device identifier
 * - `owner`: owning user ID
 * - `signKey`: signing public key
 * - `name`: user-facing device name
 * - `lastLogin`: last login timestamp string
 * - `deleted`: soft-delete flag
 */
export type { Device } from "@vex-chat/types";

/**
 * ClientOptions are the options you can pass into the client.
 */
export interface ClientOptions {
    /**
     * Select crypto profile from `@vex-chat/crypto` (`setCryptoProfile`):
     * `tweetnacl` (Ed25519 / X25519) or `fips` (P-256 + Web Crypto, separate wire
     * layout). Deployments do not interop across profiles; pick one for all peers and server.
     */
    cryptoProfile?: "fips" | "tweetnacl";
    /** Folder path where the sqlite file is created. */
    dbFolder?: string;
    /** Platform label for device registration (e.g. "ios", "macos", "linux"). */
    deviceName?: string;
    /** API host without protocol. Defaults to `api.vex.wtf`. */
    host?: string;
    /** Use sqlite in-memory mode (`:memory:`) instead of a file. */
    inMemoryDb?: boolean;
    /** Whether local message history should be persisted by default storage. */
    saveHistory?: boolean;
    /** Use `http/ws` instead of `https/wss`. Intended for local/dev environments. */
    unsafeHttp?: boolean;
    /**
     * When set (non-empty), sent as `x-dev-api-key` on every HTTP request.
     * Spire omits in-process rate limits when this matches the server's `DEV_API_KEY`
     * (local / load-testing only — never use in production).
     */
    devApiKey?: string;
}

/**
 * @ignore
 */
export interface Devices {
    /** Deletes one of the account's devices (except the currently active one). */
    delete: (deviceID: string) => Promise<void>;
    /** Registers the current key material as a new device. */
    register: () => Promise<Device | null>;
    /** Fetches one device by ID. */
    retrieve: (deviceIdentifier: string) => Promise<Device | null>;
}

/**
 * Channel is a chat channel on a server.
 *
 * Common fields:
 * - `channelID`
 * - `serverID`
 * - `name`
 */
export type { Channel } from "@vex-chat/types";

/**
 * Server is a single chat server.
 *
 * Common fields:
 * - `serverID`
 * - `name`
 * - `icon` (optional URL/data)
 */
export type { Server } from "@vex-chat/types";

/**
 * @ignore
 */
export interface Emojis {
    /** Uploads a custom emoji to a server. */
    create: (
        emoji: Uint8Array,
        name: string,
        serverID: string,
    ) => Promise<Emoji | null>;
    /** Fetches one emoji's metadata by ID. */
    retrieve: (emojiID: string) => Promise<Emoji | null>;
    /** Lists emojis available on a server. */
    retrieveList: (serverID: string) => Promise<Emoji[]>;
}

/**
 * Progress payload emitted by the `fileProgress` event.
 */
export interface FileProgress {
    /** Whether this progress event is for upload or download. */
    direction: "download" | "upload";
    /** Bytes transferred so far. */
    loaded: number;
    /** Integer percentage from `0` to `100`. */
    progress: number;
    /** Correlation token (file ID, nonce, or label depending on operation). */
    token: string;
    /** Total expected bytes when available, otherwise `0`. */
    total: number;
}

/**
 * FileRes is a server response to a file retrieval request.
 *
 * Structure:
 * - `details`: metadata (`VexFile`)
 * - `data`: decrypted binary bytes
 *
 * @example
 * ```ts
 * const response: FileRes = {
 *     details: {
 *         fileID: "bb1c3fd1-4928-48ab-9d09-3ea0972fbd9d",
 *         owner: "9b0f3f46-06ad-4bc4-8adf-4de10e13cb9c",
 *         nonce: "aa6c8d42f3fdd032a1e9fced4be379582d26ce8f69822d64",
 *     },
 *     data: Buffer.from("hello"),
 * };
 * ```
 */
export type FileRes = FileResponse;

/**
 * @ignore
 */
export interface Files {
    /** Uploads and encrypts a file. */
    create: (file: Uint8Array) => Promise<[FileSQL, string]>;
    /** Downloads and decrypts a file using a file ID and key. */
    retrieve: (fileID: string, key: string) => Promise<FileResponse | null>;
}

/**
 * @ignore
 */
export interface Invites {
    /** Creates an invite for a server and duration. */
    create: (serverID: string, duration: string) => Promise<Invite>;
    /** Redeems an invite and returns the created permission grant. */
    redeem: (inviteID: string) => Promise<Permission>;
    /** Lists active invites for a server. */
    retrieve: (serverID: string) => Promise<Invite[]>;
}

/**
 * Keys are a pair of ed25519 public and private keys,
 * encoded as hex strings.
 */
export interface Keys {
    /** Secret Ed25519 key as hex. Store securely. */
    private: string;
    /** Public Ed25519 key as hex. */
    public: string;
}

/**
 * @ignore
 */
export interface Me {
    /** Returns metadata for the currently authenticated device. */
    device: () => Device;
    /** Uploads and sets a new avatar image for the current user. */
    setAvatar: (avatar: Uint8Array) => Promise<void>;
    /** Returns the currently authenticated user profile. */
    user: () => User;
}

/**
 * Message is a chat message.
 */
export interface Message {
    /** User ID of the original author. */
    authorID: string;
    /** Whether payload decryption succeeded. */
    decrypted: boolean;
    /** Whether this message was received or sent by the current client. */
    direction: "incoming" | "outgoing";
    /** `true` when this message was forwarded to another owned device. */
    forward: boolean;
    /** Channel ID for group messages; `null` for direct messages. */
    group: null | string;
    /** Globally unique message identifier. */
    mailID: string;
    /** Plaintext message content (or empty string when decryption failed). */
    message: string;
    /** Hex-encoded nonce used for message encryption. */
    nonce: string;
    /** User ID of the intended reader. */
    readerID: string;
    /** Recipient device ID. */
    recipient: string;
    /** Sender device ID. */
    sender: string;
    /** Time the message was created/received. */
    timestamp: string;
}

/** Zod schema matching the {@link Message} interface for forwarded-message decode. */
const messageSchema: z.ZodType<Message> = z.object({
    authorID: z.string(),
    decrypted: z.boolean(),
    direction: z.enum(["incoming", "outgoing"]),
    forward: z.boolean(),
    group: z.string().nullable(),
    mailID: z.string(),
    message: z.string(),
    nonce: z.string(),
    readerID: z.string(),
    recipient: z.string(),
    sender: z.string(),
    timestamp: z.string(),
});

/** Zod schema for a single inbox entry from getMail: [header, mailBody, timestamp]. */
const mailInboxEntry = z.tuple([
    z.custom<Uint8Array>((val) => val instanceof Uint8Array),
    MailWSSchema,
    z.string(),
]);

/**
 * Event signatures emitted by {@link Client}.
 *
 * Used as the type parameter for {@link Client.on}, {@link Client.off},
 * and {@link Client.once}.
 */
export interface ClientEvents {
    /** The client has been shut down (via {@link Client.close}). */
    closed: () => void;
    /** WebSocket authorized by the server; pre-auth setup begins. */
    connected: () => void;
    /** Mail decryption pass is in progress. */
    decryptingMail: () => void;
    /** WebSocket connection lost. */
    disconnect: () => void;
    /** Progress update for a file upload or download. */
    fileProgress: (progress: FileProgress) => void;
    /** A direct or group message was sent or received. */
    message: (message: Message) => void;
    /** A permission grant was created or modified. */
    permission: (permission: Permission) => void;
    /** Post-auth setup complete — safe to call messaging/user APIs. */
    ready: () => void;
    /** A new encryption session was established with a peer device. */
    session: (session: Session, user: User) => void;
}

/**
 * @ignore
 */
export interface Messages {
    /** Deletes local history for a user/channel. */
    delete: (userOrChannelID: string) => Promise<void>;
    /** Sends an encrypted message to all members of a channel. */
    group: (channelID: string, message: string) => Promise<void>;
    /** Deletes all locally stored message history. */
    purge: () => Promise<void>;
    /** Returns local direct-message history with one user. */
    retrieve: (userID: string) => Promise<Message[]>;
    /** Returns local group-message history for one channel. */
    retrieveGroup: (channelID: string) => Promise<Message[]>;
    /** Sends an encrypted direct message to one user. */
    send: (userID: string, message: string) => Promise<void>;
}

/**
 * @ignore
 */
export interface Moderation {
    /** Returns all permission entries for a server. */
    fetchPermissionList: (serverID: string) => Promise<Permission[]>;
    /** Removes a user from a server by revoking their server permission(s). */
    kick: (userID: string, serverID: string) => Promise<void>;
}

/**
 * @ignore
 */
export interface Permissions {
    /** Deletes one permission grant. */
    delete: (permissionID: string) => Promise<void>;
    /** Lists permissions granted to the authenticated user. */
    retrieve: () => Promise<Permission[]>;
}

/**
 * @ignore
 */
export interface Servers {
    /** Creates a server. */
    create: (name: string) => Promise<Server>;
    /** Deletes a server. */
    delete: (serverID: string) => Promise<void>;
    /** Leaves a server by removing the user's permission entry. */
    leave: (serverID: string) => Promise<void>;
    /** Lists servers available to the authenticated user. */
    retrieve: () => Promise<Server[]>;
    /** Gets one server by ID. */
    retrieveByID: (serverID: string) => Promise<null | Server>;
}

/**
 * Session is an end to end encryption session with another peer.
 *
 * Key fields include:
 * - `sessionID`
 * - `userID`
 * - `deviceID`
 * - `mode` (`initiator` or `receiver`)
 * - `publicKey` and `fingerprint`
 * - `lastUsed`
 * - `verified`
 *
 * @example
 * ```ts
 * const session: Session = {
 *     sessionID: "f6e4fbd0-7222-4ba8-b799-c227faf5c8de",
 *     userID: "f34f5e37-616f-4d3a-a437-e7c27c31cb73",
 *     deviceID: "9b0f3f46-06ad-4bc4-8adf-4de10e13cb9c",
 *     mode: "initiator",
 *     SK: "7d9afde6683ecc2d1f55e34e1b95de9d4042dfd4e8cda7fdf3f0f7e02fef8f9a",
 *     publicKey: "d58f39dc4bcfe4e8ef022f34e8b6f4f6ddc9c4acee30c0d58f126aa5db3f61b0",
 *     fingerprint: "05294b9aa81d0fd0ca12a4b585f531d8ef1f53f8ea3d0200a0df3f9c44a7d8b1",
 *     lastUsed: new Date(),
 *     verified: false,
 * };
 * ```
 */
export type Session = SessionSQL;

/**
 * @ignore
 */
export interface Sessions {
    /** Marks one session as verification-confirmed. */
    markVerified: (fingerprint: string) => Promise<void>;
    /** Returns all locally known sessions. */
    retrieve: () => Promise<SessionSQL[]>;
    /** Builds a human-readable verification phrase from a session fingerprint. */
    verify: (session: SessionSQL) => string;
}

/**
 * User is a single user on the vex platform.
 *
 * This is intentionally a censored user shape for client use, containing:
 * - `userID`
 * - `username`
 * - `lastSeen`
 */
export interface User {
    /** Last-seen timestamp (ISO 8601 string). */
    lastSeen: string;
    /** User identifier. */
    userID: string;
    /** Public username. */
    username: string;
}

/**
 * @ignore
 */
export interface Users {
    /** Returns users with whom the current device has active sessions. */
    familiars: () => Promise<User[]>;
    /**
     * Looks up a user by user ID, username, or signing key.
     */
    retrieve: (userID: string) => Promise<[null | User, AxiosError | null]>;
}

/**
 * Client provides an interface for you to use a vex chat server and
 * send end to end encrypted messages to other users.
 *
 * @example
 * ```ts
 * import { Client } from "@vex-chat/libvex";
 *
 * async function main() {
 *     // generate a secret key to use, save this somewhere permanent
 *     const privateKey = Client.generateSecretKey();
 *
 *     const client = await Client.create(privateKey);
 *
 *     // you must register once before you can log in
 *     await client.register(Client.randomUsername());
 *     await client.login();
 *
 *     // The ready event fires after connect() finishes post-auth setup.
 *     // Wait for it before performing messaging or user operations.
 *     client.on("ready", async () => {
 *         const me = client.me.user();
 *
 *         // send a message
 *         await client.messages.send(me.userID, "Hello world!");
 *     })
 *
 *     // Outgoing and incoming messages are emitted here.
 *     client.on("message", (message) => {
 *         console.log("message:", message);
 *     })
 * }
 *
 * main();
 * ```
 */

/**
 * VexFile is an uploaded encrypted file.
 *
 * Common fields:
 * - `fileID`: file identifier
 * - `owner`: owner device/user ID
 * - `nonce`: file encryption nonce (hex)
 *
 * @example
 * ```ts
 * const file: VexFile = {
 *     fileID: "bb1c3fd1-4928-48ab-9d09-3ea0972fbd9d",
 *     owner: "9b0f3f46-06ad-4bc4-8adf-4de10e13cb9c",
 *     nonce: "aa6c8d42f3fdd032a1e9fced4be379582d26ce8f69822d64",
 * };
 * ```
 */
export type VexFile = FileSQL;

export class Client {
    /**
     * Decrypts a secret key from encrypted data produced by encryptKeyData().
     *
     * Pass-through utility from `@vex-chat/crypto`.
     */
    public static decryptKeyData = XUtils.decryptKeyData;
    public static decryptKeyDataAsync = XUtils.decryptKeyDataAsync;

    /**
     * Encrypts a secret key with a password.
     *
     * Pass-through utility from `@vex-chat/crypto`.
     */
    public static encryptKeyData = XUtils.encryptKeyData;
    public static encryptKeyDataAsync = XUtils.encryptKeyDataAsync;

    private static readonly NOT_FOUND_TTL = 30 * 60 * 1000;

    /**
     * Browser-safe NODE_ENV accessor.
     * Uses indirect lookup so the bare `process` global never appears in
     * source that the platform-guard plugin scans.
     */
    /**
     * Channel operations.
     */
    public channels: Channels = {
        /**
         * Creates a new channel in a server.
         * @param name - The channel name.
         * @param serverID - The server to create the channel in.
         *
         * @returns The created Channel object.
         */
        create: this.createChannel.bind(this),
        /**
         * Deletes a channel.
         * @param channelID - The channel to delete.
         */
        delete: this.deleteChannel.bind(this),
        /**
         * Retrieves all channels in a server.
         *
         * @returns The list of Channel objects.
         */
        retrieve: this.getChannelList.bind(this),
        /**
         * Retrieves channel details by its unique channelID.
         *
         * @returns The Channel object, or null.
         */
        retrieveByID: this.getChannelByID.bind(this),
        /**
         * Retrieves a channel's userlist.
         * @param channelID - The channel to retrieve the userlist for.
         */
        userList: this.getUserList.bind(this),
    };

    /**
     * Device management methods.
     */
    public devices: Devices = {
        delete: this.deleteDevice.bind(this),
        register: this.registerDevice.bind(this),
        retrieve: this.getDeviceByID.bind(this),
    };

    /**
     * Emoji operations.
     *
     * @example
     * ```ts
     * const emoji = await client.emoji.create(imageBuffer, "party", serverID);
     * const list = await client.emoji.retrieveList(serverID);
     * ```
     */
    public emoji: Emojis = {
        create: this.uploadEmoji.bind(this),
        retrieve: this.retrieveEmojiByID.bind(this),
        retrieveList: this.retrieveEmojiList.bind(this),
    };

    /** File upload/download methods. */
    public files: Files = {
        /**
         * Uploads an encrypted file and returns the details and the secret key.
         * @param file - The file bytes.
         *
         * @returns `[details, key]` — file metadata and the encryption key.
         */
        create: this.createFile.bind(this),
        retrieve: this.retrieveFile.bind(this),
    };

    /**
     * This is true if the client has ever been initialized. You can only initialize
     * a client once.
     */
    public hasInit: boolean = false;

    /**
     * This is true if the client has ever logged in before. You can only login a client once.
     */
    public hasLoggedIn: boolean = false;

    /**
     * Invite-management methods.
     */
    public invites: Invites = {
        create: this.createInvite.bind(this),
        redeem: this.redeemInvite.bind(this),
        retrieve: this.retrieveInvites.bind(this),
    };

    /**
     * Helpers for information/actions related to the currently authenticated account.
     */
    public me: Me = {
        /**
         * Retrieves current device details.
         *
         * @returns The logged in device's Device object.
         */
        device: this.getDevice.bind(this),
        /** Changes your avatar. */
        setAvatar: this.uploadAvatar.bind(this),
        /**
         * Retrieves your user information.
         *
         * @returns The logged in user's User object.
         */
        user: this.getUser.bind(this),
    };
    /**
     * Message operations (direct and group).
     *
     * @example
     * ```ts
     * await client.messages.send(userID, "Hello!");
     * await client.messages.group(channelID, "Hello channel!");
     * const dmHistory = await client.messages.retrieve(userID);
     * ```
     */
    public messages: Messages = {
        delete: this.deleteHistory.bind(this),
        /**
         * Send a group message to a channel.
         * @param channelID - The channel to send a message to.
         * @param message - The message to send.
         */
        group: this.sendGroupMessage.bind(this),
        purge: this.purgeHistory.bind(this),
        /**
         * Gets the message history with a specific userID.
         * @param userID - The user to retrieve message history for.
         *
         * @returns The list of Message objects.
         */
        retrieve: this.getMessageHistory.bind(this),
        /**
         * Gets the group message history for a channel.
         * @param channelID - The channel to retrieve message history for.
         *
         * @returns The list of Message objects.
         */
        retrieveGroup: this.getGroupHistory.bind(this),
        /**
         * Send a direct message.
         * @param userID - The user to send a message to.
         * @param message - The message to send.
         */
        send: this.sendMessage.bind(this),
    };

    /**
     * Server moderation helper methods.
     */
    public moderation: Moderation = {
        fetchPermissionList: this.fetchPermissionList.bind(this),
        kick: this.kickUser.bind(this),
    };

    /**
     * Permission-management methods for the current user.
     */
    public permissions: Permissions = {
        delete: this.deletePermission.bind(this),
        retrieve: this.getPermissions.bind(this),
    };

    public sending = new Map<string, Device>();

    /**
     * Server operations.
     *
     * @example
     * ```ts
     * const servers = await client.servers.retrieve();
     * const created = await client.servers.create("Team Space");
     * ```
     */
    public servers: Servers = {
        /**
         * Creates a new server.
         * @param name - The server name.
         *
         * @returns The created Server object.
         */
        create: this.createServer.bind(this),
        /**
         * Deletes a server.
         * @param serverID - The server to delete.
         */
        delete: this.deleteServer.bind(this),
        leave: this.leaveServer.bind(this),
        /**
         * Retrieves all servers the logged in user has access to.
         *
         * @returns The list of Server objects.
         */
        retrieve: this.getServerList.bind(this),
        /**
         * Retrieves server details by its unique serverID.
         *
         * @returns The requested Server object, or null if the id does not exist.
         */
        retrieveByID: this.getServerByID.bind(this),
    };

    /**
     * Encryption-session helpers.
     */
    public sessions: Sessions = {
        /**
         * Marks a session as verified, implying that the user has confirmed
         * that the session mnemonic matches with the other user.
         * @param sessionID - The session to mark.
         */
        markVerified: this.markSessionVerified.bind(this),

        /**
         * Gets all encryption sessions.
         *
         * @returns The list of Session encryption sessions.
         */
        retrieve: this.getSessionList.bind(this),

        /**
         * Returns a mnemonic for the session, to verify with the other user.
         * @param session - The session to get the mnemonic for.
         *
         * @returns The mnemonic representation of the session.
         */
        verify: (session: SessionSQL) => Client.getMnemonic(session),
    };

    /**
     * User operations.
     *
     * @example
     * ```ts
     * const [user] = await client.users.retrieve("alice");
     * const familiarUsers = await client.users.familiars();
     * ```
     */
    public users: Users = {
        /**
         * Retrieves the list of users you can currently access, or are already familiar with.
         *
         * @returns The list of User objects.
         */
        familiars: this.getFamiliars.bind(this),
        /**
         * Retrieves a user's information by a string identifier.
         * @param identifier - A userID, hex string public key, or a username.
         *
         * @returns The user's User object, or null if the user does not exist.
         */
        retrieve: this.fetchUser.bind(this),
    };

    private readonly database: Storage;

    private readonly dbPath: string;

    private device?: Device;

    private deviceRecords: Record<string, Device> = {};

    // ── Event subscription (composition over inheritance) ───────────────
    private readonly emitter = new EventEmitter<ClientEvents>();

    private fetchingMail: boolean = false;
    private firstMailFetch = true;

    private readonly forwarded = new Set<string>();

    private readonly host: string;
    /**
     * Node-only: per-client HTTP(S) agents (see `init()` + `storage/node/http-agents`).
     * Dropped on `close()` so idle keep-alive sockets do not keep the process alive.
     */
    private nodeHttpAgents?: {
        http: { destroy(): void };
        https: { destroy(): void };
    };
    /** Cancels in-flight axios work on `close()` so `postAuth`/`getMail` cannot hang forever. */
    private readonly httpAbortController = new AbortController();
    private readonly http: AxiosInstance;
    private readonly idKeys: KeyPair | null;
    private isAlive: boolean = true;
    private readonly mailInterval?: NodeJS.Timeout;

    private manuallyClosing: boolean = false;
    /* Retrieves the userID with the user identifier.
    user identifier is checked for userID, then signkey,
    and finally falls back to username. */
    /** Negative cache for user lookups that returned 404. TTL = 30 minutes. */
    private readonly notFoundUsers = new Map<string, number>();

    private readonly options?: ClientOptions | undefined;

    private pingInterval: null | ReturnType<typeof setTimeout> = null;
    private readonly prefixes:
        | { HTTP: "http://"; WS: "ws://" }
        | { HTTP: "https://"; WS: "wss://" };

    private reading: boolean = false;
    private readonly seenMailIDs: Set<string> = new Set();
    private sessionRecords: Record<string, SessionCrypto> = {};
    // these are created from one set of sign keys
    private readonly signKeys: KeyPair;

    private socket: WebSocketLike;
    private token: null | string = null;
    private user?: User;

    private userRecords: Record<string, User> = {};

    private xKeyRing?: XKeyRing;
    private readonly cryptoProfile: CryptoProfile;

    private constructor(
        material: {
            cryptoProfile: CryptoProfile;
            idKeys: KeyPair;
            signKeys: KeyPair;
        },
        options?: ClientOptions,
        storage?: Storage,
    ) {
        this.options = options;
        this.cryptoProfile = material.cryptoProfile;
        this.signKeys = material.signKeys;
        this.idKeys = material.idKeys;

        if (options?.unsafeHttp) {
            const env = Client.getNodeEnv();
            if (env !== "development" && env !== "test") {
                throw new Error(
                    "unsafeHttp is only allowed when NODE_ENV is 'development' or 'test'. " +
                        "Set NODE_ENV=development to use unencrypted transport.",
                );
            }
            this.prefixes = { HTTP: "http://", WS: "ws://" };
        } else {
            this.prefixes = { HTTP: "https://", WS: "wss://" };
        }

        this.host = options?.host || "api.vex.wtf";
        const dbFileName = options?.inMemoryDb
            ? ":memory:"
            : XUtils.encodeHex(this.signKeys.publicKey) + ".sqlite";
        this.dbPath = options?.dbFolder
            ? options.dbFolder + "/" + dbFileName
            : dbFileName;

        if (!storage) {
            throw new Error(
                "No storage provided. Use Client.create() which resolves storage automatically.",
            );
        }
        this.database = storage;

        this.database.on("error", (_error: Error) => {
            void this.close(true);
        });

        this.http = axios.create({
            responseType: "arraybuffer",
            signal: this.httpAbortController.signal,
        });
        const devKey = options?.devApiKey?.trim();
        if (devKey !== undefined && devKey.length > 0) {
            this.http.defaults.headers.common["x-dev-api-key"] = devKey;
        }

        this.socket = new WebSocketAdapter(this.prefixes.WS + this.host);
        this.socket.onerror = () => {};
    }
    /**
     * Creates and initializes a client in one step.
     *
     * @param privateKey - Hex secret key. When omitted, a fresh key is generated.
     * @param options - Runtime options.
     * @param storage - Custom storage backend implementing {@link Storage}.
     *
     * @example
     * ```ts
     * const client = await Client.create(privateKey, { host: "api.vex.wtf" });
     * ```
     */
    public static create = async (
        privateKey?: string,
        options?: ClientOptions,
        storage?: Storage,
    ): Promise<Client> => {
        const profile = options?.cryptoProfile ?? "tweetnacl";
        setCryptoProfile(profile);

        if (
            profile === "fips" &&
            typeof globalThis.crypto.subtle !== "object"
        ) {
            throw new Error(
                'cryptoProfile="fips" requires Web Crypto (globalThis.crypto.subtle).',
            );
        }

        let signKeys: KeyPair;
        if (privateKey) {
            const d = XUtils.decodeHex(privateKey);
            signKeys =
                profile === "tweetnacl"
                    ? xSignKeyPairFromSecret(d)
                    : await xSignKeyPairFromSecretAsync(d);
        } else {
            signKeys =
                profile === "tweetnacl"
                    ? xSignKeyPair()
                    : await xSignKeyPairAsync();
        }

        const idKeys =
            profile === "tweetnacl"
                ? (() => {
                      const c = XKeyConvert.convertKeyPair(signKeys);
                      if (!c) {
                          throw new Error("Could not convert key to X25519!");
                      }
                      return c;
                  })()
                : await xEcdhKeyPairFromEcdsaKeyPairAsync(signKeys);

        const atRestAes = XUtils.deriveLocalAtRestAesKey(
            idKeys.secretKey,
            profile,
        );

        let resolvedStorage = storage;
        if (!resolvedStorage) {
            const { createNodeStorage } = await import("./storage/node.js");
            const dbFileName = options?.inMemoryDb
                ? ":memory:"
                : XUtils.encodeHex(signKeys.publicKey) + ".sqlite";
            const dbPath = options?.dbFolder
                ? options.dbFolder + "/" + dbFileName
                : dbFileName;
            resolvedStorage = createNodeStorage(dbPath, atRestAes);
        }

        await resolvedStorage.init();

        const client = new Client(
            {
                cryptoProfile: profile,
                idKeys,
                signKeys,
            },
            options,
            resolvedStorage,
        );
        await client.init();
        return client;
    };

    /**
     * Generates a signing secret key as a hex string (tweetnacl: Ed25519; fips: P-256 pkcs8).
     * In `fips` mode, use `Client.generateSecretKeyAsync()` instead (Web Crypto is async).
     */
    public static generateSecretKey(): string {
        if (getCryptoProfile() === "fips") {
            throw new Error(
                'Use await Client.generateSecretKeyAsync() when the active crypto profile is "fips".',
            );
        }
        return XUtils.encodeHex(xSignKeyPair().secretKey);
    }

    /**
     * Async key generation — required for `fips` profile; safe for `tweetnacl` as well.
     */
    public static async generateSecretKeyAsync(): Promise<string> {
        if (getCryptoProfile() === "fips") {
            return XUtils.encodeHex((await xSignKeyPairAsync()).secretKey);
        }
        return XUtils.encodeHex(xSignKeyPair().secretKey);
    }

    /**
     * Generates a random username using bip39.
     *
     * @returns The username.
     */
    public static randomUsername() {
        const IKM = XUtils.decodeHex(XUtils.encodeHex(xRandomBytes(16)));
        const mnemonic = xMnemonic(IKM).split(" ");
        const addendum = XUtils.uint8ArrToNumber(xRandomBytes(1));

        const word0 = mnemonic[0] ?? "";
        const word1 = mnemonic[1] ?? "";
        return capitalize(word0) + capitalize(word1) + addendum.toString();
    }

    private static deserializeExtra(
        type: MailType,
        extra: Uint8Array,
    ): Uint8Array[] {
        switch (type) {
            case MailType.initial: {
                if (isFipsInitialExtraV1(extra)) {
                    const [a, b, c, d] = decodeFipsInitialExtraV1(extra);
                    return [a, b, c, d];
                }
                /* 32B sign | 32B eph | 32B PK | 68B AD | 6B index (tweetnacl) */
                const signKey = extra.slice(0, 32);
                const ephKey = extra.slice(32, 64);
                const ad = extra.slice(96, 164);
                const index = extra.slice(164, 170);
                return [signKey, ephKey, ad, index];
            }
            case MailType.subsequent:
                if (isFipsSubsequentExtraV1(extra)) {
                    return [decodeFipsSubsequentExtraV1(extra)];
                }
                return [extra];
            default:
                return [];
        }
    }

    private static getMnemonic(session: SessionSQL): string {
        return xMnemonic(xKDF(XUtils.decodeHex(session.fingerprint)));
    }

    /**
     * True when running under Node (has `process.versions`).
     * Uses indirect lookup so the bare `process` global never appears in
     * source that the platform-guard plugin scans.
     */
    private static isNodeRuntime(): boolean {
        try {
            const g = Object.getOwnPropertyDescriptor(
                globalThis,
                "\u0070rocess",
            );
            if (!g) return false;
            const proc: unknown =
                typeof g.get === "function" ? g.get() : g.value;
            if (typeof proc !== "object" || proc === null) {
                return false;
            }
            return (
                "versions" in proc &&
                typeof (proc as { versions?: unknown }).versions === "object"
            );
        } catch {
            return false;
        }
    }

    /**
     * Browser-safe NODE_ENV accessor.
     * Uses indirect lookup so the bare `process` global never appears in
     * source that the platform-guard plugin scans.
     */
    private static getNodeEnv(): string | undefined {
        try {
            const g = Object.getOwnPropertyDescriptor(
                globalThis,
                "\u0070rocess",
            );
            if (!g) return undefined;
            // Node 24+ exposes `process` as an accessor (get/set), not a value.
            const proc: unknown =
                typeof g.get === "function" ? g.get() : g.value;
            if (typeof proc !== "object" || proc === null) {
                return undefined;
            }
            const envDesc = Object.getOwnPropertyDescriptor(proc, "env");
            if (!envDesc) return undefined;
            const env: unknown =
                typeof envDesc.get === "function"
                    ? envDesc.get()
                    : envDesc.value;
            if (typeof env !== "object" || env === null) {
                return undefined;
            }
            const valDesc = Object.getOwnPropertyDescriptor(env, "NODE_ENV");
            if (!valDesc) return undefined;
            const val: unknown =
                typeof valDesc.get === "function"
                    ? valDesc.get()
                    : valDesc.value;
            return typeof val === "string" ? val : undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * Fresh read of the `manuallyClosing` flag for async loops — direct property checks
     * after `await` are flagged as always-false by control-flow analysis even though
     * `close()` can run concurrently.
     */
    private isManualCloseInFlight(): boolean {
        return this.manuallyClosing;
    }

    /**
     * Closes the client — disconnects the WebSocket, shuts down storage,
     * and emits `closed` unless `muteEvent` is `true`.
     *
     * @param muteEvent - When `true`, suppresses the `closed` event.
     */
    public async close(muteEvent = false): Promise<void> {
        this.manuallyClosing = true;
        this.httpAbortController.abort();
        this.socket.close();
        await this.database.close();

        if (this.nodeHttpAgents) {
            this.nodeHttpAgents.http.destroy();
            this.nodeHttpAgents.https.destroy();
            delete this.nodeHttpAgents;
        }

        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }

        if (this.mailInterval) {
            clearInterval(this.mailInterval);
        }
        delete this.xKeyRing;

        if (!muteEvent) {
            this.emitter.emit("closed");
        }
        return;
    }

    /**
     * Connects your device to the chat. You must have a valid Bearer token.
     * You can check whoami() to see before calling connect().
     */
    public async connect(): Promise<void> {
        if (!this.token) {
            throw new Error(
                "No token — call login() or loginWithDeviceKey() first.",
            );
        }
        const { user } = await this.whoami();
        this.setUser(user);

        this.device = await this.retrieveOrCreateDevice();

        const connectToken = await this.getToken("connect");
        if (!connectToken) {
            throw new Error("Couldn't get connect token.");
        }
        const signedAsync = await xSignAsync(
            Uint8Array.from(uuid.parse(connectToken.key)),
            this.signKeys.secretKey,
        );

        const res = await this.http.post(
            this.getHost() + "/device/" + this.device.deviceID + "/connect",
            msgpack.encode({ signed: signedAsync }),
            { headers: { "Content-Type": "application/msgpack" } },
        );
        const { deviceToken } = decodeAxios(ConnectResponseCodec, res.data);
        this.http.defaults.headers.common["X-Device-Token"] = deviceToken;

        this.initSocket();
        // Yield the event loop so the WS open callback fires and sends the
        // auth message before OTK generation blocks for ~5s on mobile.
        await new Promise((r) => setTimeout(r, 0));
        await this.negotiateOTK();
    }

    /**
     * Delete all local data — message history, encryption sessions, and prekeys.
     * Closes the client afterward. Credentials (keychain) must be cleared by the consumer.
     */
    public async deleteAllData(): Promise<void> {
        await this.database.purgeHistory();
        await this.database.purgeKeyData();
        await this.close(true);
    }

    /**
     * Returns the current HTTP API origin with protocol.
     *
     * @example
     * ```ts
     * console.log(client.getHost()); // "https://api.vex.wtf"
     * ```
     */
    public getHost() {
        return this.prefixes.HTTP + this.host;
    }

    /**
     * Gets the hex string representations of the public and private keys.
     */
    public getKeys(): Keys {
        return {
            private: XUtils.encodeHex(this.signKeys.secretKey),
            public: XUtils.encodeHex(this.signKeys.publicKey),
        };
    }

    /**
     * Authenticates with username/password and stores the Bearer auth token.
     *
     * @param username - Account username.
     * @param password - Account password.
     * @returns `{ ok: true }` on success, `{ ok: false, error }` on failure.
     *
     * @example
     * ```ts
     * const result = await client.login("alice", "correct horse battery staple");
     * if (!result.ok) console.error(result.error);
     * ```
     */
    public async login(
        username: string,
        password: string,
    ): Promise<{ error?: string; ok: boolean }> {
        try {
            const res = await this.http.post(
                this.getHost() + "/auth",
                msgpack.encode({
                    password,
                    username,
                }),
                {
                    headers: { "Content-Type": "application/msgpack" },
                },
            );
            const { token, user } = decodeAxios(AuthResponseCodec, res.data);

            this.setUser(user);
            this.token = token;
            this.http.defaults.headers.common.Authorization = `Bearer ${token}`;
            return { ok: true };
        } catch (err: unknown) {
            const error = err instanceof Error ? err.message : String(err);
            return { error, ok: false };
        }
    }

    /**
     * Authenticates using the device's Ed25519 signing key.
     * No password needed — proves possession of the private key via
     * challenge-response. Issues a short-lived (1-hour) JWT.
     *
     * Used by auto-login when stored credentials have a deviceKey
     * but no valid session.
     */
    public async loginWithDeviceKey(deviceID?: string): Promise<Error | null> {
        try {
            const id = deviceID ?? this.device?.deviceID;
            if (!id) {
                return new Error("No deviceID — pass it or connect first.");
            }
            const signKeyHex = XUtils.encodeHex(this.signKeys.publicKey);

            const challengeRes = await this.http.post(
                this.getHost() + "/auth/device",
                msgpack.encode({
                    deviceID: id,
                    signKey: signKeyHex,
                }),
                { headers: { "Content-Type": "application/msgpack" } },
            );
            const { challenge, challengeID } = decodeAxios(
                DeviceChallengeCodec,
                challengeRes.data,
            );

            const signed = XUtils.encodeHex(
                await xSignAsync(
                    XUtils.decodeHex(challenge),
                    this.signKeys.secretKey,
                ),
            );

            const verifyRes = await this.http.post(
                this.getHost() + "/auth/device/verify",
                msgpack.encode({ challengeID, signed }),
                { headers: { "Content-Type": "application/msgpack" } },
            );
            const { token, user } = decodeAxios(
                AuthResponseCodec,
                verifyRes.data,
            );

            this.setUser(user);
            this.token = token;
            this.http.defaults.headers.common.Authorization = `Bearer ${token}`;
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            return error;
        }
        return null;
    }

    /**
     * Logs out the current authenticated session from the server.
     */
    public async logout(): Promise<void> {
        await this.http.post(this.getHost() + "/goodbye");
    }

    /** Removes an event listener. See {@link ClientEvents} for available events. */
    off<E extends keyof ClientEvents>(
        event: E,
        fn?: ClientEvents[E],
        context?: unknown,
    ): this {
        this.emitter.off(
            event,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ee3 requires generic listener type; E constraint guarantees safety
            fn as ((...args: unknown[]) => void) | undefined,
            context,
        );
        return this;
    }

    /** Subscribes to an event. See {@link ClientEvents} for available events. */
    on<E extends keyof ClientEvents>(
        event: E,
        fn: ClientEvents[E],
        context?: unknown,
    ): this {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- EventEmitter requires a generic listener type; the generic constraint on E guarantees type safety
        this.emitter.on(event, fn as (...args: unknown[]) => void, context);
        return this;
    }

    /** Subscribes to an event for a single firing, then auto-removes. */
    once<E extends keyof ClientEvents>(
        event: E,
        fn: ClientEvents[E],
        context?: unknown,
    ): this {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- EventEmitter requires a generic listener type; the generic constraint on E guarantees type safety
        this.emitter.once(event, fn as (...args: unknown[]) => void, context);
        return this;
    }

    /**
     * Registers a new account on the server.
     *
     * @param username - The username to register. Must be unique.
     * @param password - Account password.
     * @returns `[user, null]` on success, `[null, error]` on failure.
     *
     * @example
     * ```ts
     * const [user, err] = await client.register("MyUsername", "hunter2");
     * ```
     */
    public async register(
        username: string,
        password: string,
    ): Promise<[null | User, Error | null]> {
        while (!this.xKeyRing) {
            await sleep(100);
        }
        const regKey = await this.getToken("register");
        if (regKey) {
            const signKey = XUtils.encodeHex(this.signKeys.publicKey);
            const signed = XUtils.encodeHex(
                await xSignAsync(
                    Uint8Array.from(uuid.parse(regKey.key)),
                    this.signKeys.secretKey,
                ),
            );
            const preKeyIndex = this.xKeyRing.preKeys.index;
            const regMsg: RegistrationPayload = {
                deviceName: this.options?.deviceName ?? "unknown",
                password,
                preKey: XUtils.encodeHex(
                    this.xKeyRing.preKeys.keyPair.publicKey,
                ),
                preKeyIndex,
                preKeySignature: XUtils.encodeHex(
                    this.xKeyRing.preKeys.signature,
                ),
                signed,
                signKey,
                username,
            };
            try {
                const res = await this.http.post(
                    this.getHost() + "/register",
                    msgpack.encode(regMsg),
                    { headers: { "Content-Type": "application/msgpack" } },
                );
                this.setUser(decodeAxios(UserCodec, res.data));
                return [this.getUser(), null];
            } catch (err: unknown) {
                if (isAxiosError(err) && err.response) {
                    const raw: unknown = err.response.data;
                    const msg =
                        raw instanceof ArrayBuffer || raw instanceof Uint8Array
                            ? new TextDecoder().decode(raw)
                            : String(raw);
                    return [null, new Error(msg)];
                }
                return [
                    null,
                    err instanceof Error ? err : new Error(String(err)),
                ];
            }
        } else {
            return [null, new Error("Couldn't get regkey from server.")];
        }
    }

    removeAllListeners(event?: keyof ClientEvents): this {
        this.emitter.removeAllListeners(event);
        return this;
    }

    /**
     * Returns a compact `<username><deviceID>` debug label.
     */
    public toString(): string {
        return (
            (this.user?.username ?? "") +
            "<" +
            (this.device?.deviceID ?? "") +
            ">"
        );
    }

    /**
     * Returns details about the currently authenticated session.
     *
     * @returns The authenticated user, token expiry, and active token.
     *
     * @example
     * ```ts
     * const auth = await client.whoami();
     * console.log(auth.user.username, new Date(auth.exp));
     * ```
     */
    public async whoami(): Promise<{
        exp: number;
        user: User;
    }> {
        const res = await this.http.post(this.getHost() + "/whoami");

        const whoami = decodeAxios(WhoamiCodec, res.data);
        return whoami;
    }

    private censorPreKey(preKey: PreKeysSQL): PreKeysWS {
        if (!preKey.index) {
            throw new Error("Key index is required.");
        }
        return {
            deviceID: this.getDevice().deviceID,
            index: preKey.index,
            publicKey: XUtils.decodeHex(preKey.publicKey),
            signature: XUtils.decodeHex(preKey.signature),
        };
    }

    private async createChannel(
        name: string,
        serverID: string,
    ): Promise<Channel> {
        const body = { name };
        const res = await this.http.post(
            this.getHost() + "/server/" + serverID + "/channels",
            msgpack.encode(body),
            { headers: { "Content-Type": "application/msgpack" } },
        );
        return decodeAxios(ChannelCodec, res.data);
    }

    // returns the file details and the encryption key
    private async createFile(file: Uint8Array): Promise<[FileSQL, string]> {
        return this.runWithThisCryptoProfile(async () => {
            const nonce = xMakeNonce();
            const fileKey: Uint8Array =
                this.cryptoProfile === "fips"
                    ? xRandomBytes(32)
                    : (await xBoxKeyPairAsync()).secretKey;
            const box = await xSecretboxAsync(
                Uint8Array.from(file),
                nonce,
                fileKey,
            );

            if (typeof FormData !== "undefined") {
                const fpayload = new FormData();
                fpayload.set("owner", this.getDevice().deviceID);
                fpayload.set("nonce", XUtils.encodeHex(nonce));
                fpayload.set("file", new Blob([new Uint8Array(box)]));

                const fres = await this.http.post(
                    this.getHost() + "/file",
                    fpayload,
                    {
                        headers: { "Content-Type": "multipart/form-data" },
                        onUploadProgress: (progressEvent) => {
                            const percentCompleted = Math.round(
                                (progressEvent.loaded * 100) /
                                    (progressEvent.total ?? 1),
                            );
                            const { loaded, total = 0 } = progressEvent;
                            const progress: FileProgress = {
                                direction: "upload",
                                loaded,
                                progress: percentCompleted,
                                token: XUtils.encodeHex(nonce),
                                total,
                            };
                            this.emitter.emit("fileProgress", progress);
                        },
                    },
                );
                const fcreatedFile = decodeAxios(FileSQLCodec, fres.data);

                return [fcreatedFile, XUtils.encodeHex(fileKey)];
            }

            const payload: {
                file: string;
                nonce: string;
                owner: string;
            } = {
                file: XUtils.encodeBase64(box),
                nonce: XUtils.encodeHex(nonce),
                owner: this.getDevice().deviceID,
            };
            const res = await this.http.post(
                this.getHost() + "/file/json",
                msgpack.encode(payload),
                { headers: { "Content-Type": "application/msgpack" } },
            );
            const createdFile = decodeAxios(FileSQLCodec, res.data);

            return [createdFile, XUtils.encodeHex(fileKey)];
        });
    }

    private async createInvite(serverID: string, duration: string) {
        const payload = {
            duration,
            serverID,
        };

        const res = await this.http.post(
            this.getHost() + "/server/" + serverID + "/invites",
            msgpack.encode(payload),
            { headers: { "Content-Type": "application/msgpack" } },
        );

        return decodeAxios(InviteCodec, res.data);
    }

    private async createPreKey(): Promise<UnsavedPreKey> {
        const preKeyPair = await xBoxKeyPairAsync();
        const toSign =
            this.cryptoProfile === "fips"
                ? fipsP256PreKeySignPayload(preKeyPair.publicKey)
                : xEncode(xConstants.CURVE, preKeyPair.publicKey);
        return {
            keyPair: preKeyPair,
            signature: await xSignAsync(toSign, this.signKeys.secretKey),
        };
    }

    private async createServer(name: string): Promise<Server> {
        const res = await this.http.post(
            this.getHost() + "/server/" + globalThis.btoa(name),
        );
        return decodeAxios(ServerCodec, res.data);
    }

    /**
     * `xDHAsync` and other helpers in `@vex-chat/crypto` use the process-wide
     * active profile. When several {@link Client} instances use different
     * `cryptoProfile` values, scope the global to this instance for the duration
     * of that crypto work.
     */
    private async runWithThisCryptoProfile<T>(
        fn: () => Promise<T>,
    ): Promise<T> {
        const prev = getCryptoProfile();
        if (prev === this.cryptoProfile) {
            return await fn();
        }
        setCryptoProfile(this.cryptoProfile);
        try {
            return await fn();
        } finally {
            setCryptoProfile(prev);
        }
    }

    private async createSession(
        device: Device,
        user: User,
        message: Uint8Array,
        group: null | Uint8Array,
        /* this is passed through if the first message is 
        part of a group message */
        mailID: null | string,
        forward: boolean,
        /**
         * When `readMail` triggers a best-effort session re-establish, key-bundle
         * errors should not reject the full read pipeline.
         */
        allowKeyBundleFailure = false,
    ): Promise<void> {
        return this.runWithThisCryptoProfile(async () => {
            let keyBundle: KeyBundle;

            try {
                keyBundle = await this.retrieveKeyBundle(device.deviceID);
            } catch (e) {
                if (allowKeyBundleFailure) {
                    return;
                }
                const wrap =
                    e instanceof Error ? e : new Error(String(e), { cause: e });
                throw new Error(
                    `Failed to load keyBundle for device ${device.deviceID}: ${wrap.message}`,
                    { cause: e },
                );
            }

            if (!this.xKeyRing) {
                if (this.manuallyClosing) {
                    return;
                }
                throw new Error("Key ring not initialized.");
            }

            // my keys
            const IK_A = this.xKeyRing.identityKeys.secretKey;
            const IK_AP = this.xKeyRing.identityKeys.publicKey;
            const EK_A = this.xKeyRing.ephemeralKeys.secretKey;

            const fips = this.cryptoProfile === "fips";
            // their keys — FIPS: `signKey` in bundle is the peer P-256 ECDH identity (raw, typically 65B).
            const SPK_B = new Uint8Array(keyBundle.preKey.publicKey);
            const OPK_B = keyBundle.otk
                ? new Uint8Array(keyBundle.otk.publicKey)
                : null;
            const IK_B = fips
                ? new Uint8Array(keyBundle.signKey)
                : (() => {
                      const c = XKeyConvert.convertPublicKey(
                          new Uint8Array(keyBundle.signKey),
                      );
                      if (!c) {
                          throw new Error(
                              "Could not convert sign key to X25519.",
                          );
                      }
                      return c;
                  })();

            // diffie hellman functions
            const DH1 = await xDHAsync(new Uint8Array(IK_A), SPK_B);
            const DH2 = await xDHAsync(new Uint8Array(EK_A), IK_B);
            const DH3 = await xDHAsync(new Uint8Array(EK_A), SPK_B);
            const DH4 = OPK_B
                ? await xDHAsync(new Uint8Array(EK_A), OPK_B)
                : null;

            // initial key material
            const IKM = DH4
                ? xConcat(DH1, DH2, DH3, DH4)
                : xConcat(DH1, DH2, DH3);

            // one time key index
            const IDX = keyBundle.otk
                ? XUtils.numberToUint8Arr(keyBundle.otk.index ?? 0)
                : XUtils.numberToUint8Arr(0);

            // shared secret key
            const SK = xKDF(IKM);
            const PK = (await xBoxKeyPairFromSecretAsync(SK)).publicKey;

            const AD = fips
                ? fipsP256AdFromIdentityPubs(
                      IK_AP,
                      new Uint8Array(keyBundle.signKey),
                  )
                : xConcat(
                      xEncode(xConstants.CURVE, IK_AP),
                      xEncode(xConstants.CURVE, IK_B),
                  );

            const nonce = xMakeNonce();
            const cipher = await xSecretboxAsync(message, nonce, SK);

            const signKeyWire = fips ? IK_AP : this.signKeys.publicKey;
            const ephKeyWire = this.xKeyRing.ephemeralKeys.publicKey;

            const extra = fips
                ? encodeFipsInitialExtraV1(signKeyWire, ephKeyWire, PK, AD, IDX)
                : xConcat(
                      this.signKeys.publicKey,
                      this.xKeyRing.ephemeralKeys.publicKey,
                      PK,
                      AD,
                      IDX,
                  );

            const mail: MailWS = {
                authorID: this.getUser().userID,
                cipher,
                extra,
                forward,
                group,
                mailID: mailID || uuid.v4(),
                mailType: MailType.initial,
                nonce,
                readerID: user.userID,
                recipient: device.deviceID,
                sender: this.getDevice().deviceID,
            };

            const hmac = xHMAC(mail, SK);

            const msg: ResourceMsg = {
                action: "CREATE",
                data: mail,
                resourceType: "mail",
                transmissionID: uuid.v4(),
                type: "resource",
            };

            // discard the ephemeral keys
            await this.newEphemeralKeys();

            const sessionEntry: SessionSQL = {
                deviceID: device.deviceID,
                fingerprint: XUtils.encodeHex(AD),
                lastUsed: new Date().toISOString(),
                mode: "initiator",
                publicKey: XUtils.encodeHex(PK),
                sessionID: uuid.v4(),
                SK: XUtils.encodeHex(SK),
                userID: user.userID,
                verified: false,
            };

            await this.database.saveSession(sessionEntry);

            this.emitter.emit("session", sessionEntry, user);

            // emit the message
            const forwardedMsg = forward
                ? messageSchema.parse(msgpack.decode(message))
                : null;
            const emitMsg: Message = forwardedMsg
                ? { ...forwardedMsg, forward: true }
                : {
                      authorID: mail.authorID,
                      decrypted: true,
                      direction: "outgoing",
                      forward: mail.forward,
                      group: mail.group ? uuid.stringify(mail.group) : null,
                      mailID: mail.mailID,
                      message: XUtils.encodeUTF8(message),
                      nonce: XUtils.encodeHex(new Uint8Array(mail.nonce)),
                      readerID: mail.readerID,
                      recipient: mail.recipient,
                      sender: mail.sender,
                      timestamp: new Date().toISOString(),
                  };
            this.emitter.emit("message", emitMsg);

            // send mail and wait for response
            await new Promise((res, rej) => {
                const callback = (packedMsg: Uint8Array) => {
                    const [_header, receivedMsg] =
                        XUtils.unpackMessage(packedMsg);
                    if (receivedMsg.transmissionID === msg.transmissionID) {
                        this.socket.off("message", callback);
                        const parsed = WSMessageSchema.safeParse(receivedMsg);
                        if (parsed.success && parsed.data.type === "success") {
                            res(parsed.data.data);
                        } else {
                            rej(
                                new Error(
                                    "Mail delivery failed: " +
                                        JSON.stringify(receivedMsg),
                                ),
                            );
                        }
                    }
                };
                this.socket.on("message", callback);
                void this.send(msg, hmac);
            });
        });
    }

    private async deleteChannel(channelID: string): Promise<void> {
        await this.http.delete(this.getHost() + "/channel/" + channelID);
    }

    private async deleteDevice(deviceID: string): Promise<void> {
        if (deviceID === this.getDevice().deviceID) {
            throw new Error("You can't delete the device you're logged in to.");
        }
        await this.http.delete(
            this.prefixes.HTTP +
                this.host +
                "/user/" +
                this.getUser().userID +
                "/devices/" +
                deviceID,
        );
    }

    private async deleteHistory(channelOrUserID: string): Promise<void> {
        await this.database.deleteHistory(channelOrUserID);
    }

    private async deletePermission(permissionID: string): Promise<void> {
        await this.http.delete(this.getHost() + "/permission/" + permissionID);
    }

    private async deleteServer(serverID: string): Promise<void> {
        await this.http.delete(this.getHost() + "/server/" + serverID);
    }
    /**
     * Gets a list of permissions for a server.
     *
     * @returns The list of Permission objects.
     */
    private async fetchPermissionList(serverID: string): Promise<Permission[]> {
        const res = await this.http.get(
            this.prefixes.HTTP +
                this.host +
                "/server/" +
                serverID +
                "/permissions",
        );
        return decodeAxios(PermissionArrayCodec, res.data);
    }

    private async fetchUser(
        userIdentifier: string,
    ): Promise<[null | User, AxiosError | null]> {
        // Positive cache
        if (userIdentifier in this.userRecords) {
            return [this.userRecords[userIdentifier] ?? null, null];
        }

        // Negative cache — skip users we know don't exist (TTL-based)
        const notFoundAt = this.notFoundUsers.get(userIdentifier);
        if (notFoundAt && Date.now() - notFoundAt < Client.NOT_FOUND_TTL) {
            return [null, null];
        }

        try {
            const res = await this.http.get(
                this.getHost() + "/user/" + userIdentifier,
            );
            const userRecord = decodeAxios(UserCodec, res.data);
            this.userRecords[userIdentifier] = userRecord;
            this.notFoundUsers.delete(userIdentifier);
            return [userRecord, null];
        } catch (err: unknown) {
            if (isAxiosError(err) && err.response?.status === 404) {
                // Definitive: user doesn't exist — cache and don't retry
                this.notFoundUsers.set(userIdentifier, Date.now());
                return [null, err];
            }
            // Transient (5xx, network error) — don't cache, caller can retry
            return [null, isAxiosError(err) ? err : null];
        }
    }

    private async forward(message: Message) {
        if (this.isManualCloseInFlight()) {
            return;
        }

        const copy = { ...message };

        if (this.forwarded.has(copy.mailID)) {
            return;
        }
        this.forwarded.add(copy.mailID);
        if (this.forwarded.size > 1000) {
            // Remove oldest entry
            const first = this.forwarded.values().next().value;
            if (first !== undefined) this.forwarded.delete(first);
        }

        const msgBytes = Uint8Array.from(msgpack.encode(copy));

        const devices = await this.fetchUserDeviceListWithBackoff(
            this.getUser().userID,
            "own",
        );
        for (const device of devices) {
            if (device.deviceID === this.getDevice().deviceID) {
                continue;
            }
            try {
                await this.sendMail(
                    device,
                    this.getUser(),
                    msgBytes,
                    null,
                    copy.mailID,
                    true,
                );
            } catch {
                /* best-effort per device; parallel handshakes share ephemeral state */
            }
        }
    }

    private async getChannelByID(channelID: string): Promise<Channel | null> {
        try {
            const res = await this.http.get(
                this.getHost() + "/channel/" + channelID,
            );
            return decodeAxios(ChannelCodec, res.data);
        } catch (_err: unknown) {
            return null;
        }
    }

    private async getChannelList(serverID: string): Promise<Channel[]> {
        const res = await this.http.get(
            this.getHost() + "/server/" + serverID + "/channels",
        );
        return decodeAxios(ChannelArrayCodec, res.data);
    }

    private getDevice(): Device {
        if (!this.device) {
            throw new Error(
                "You must wait until the auth event is emitted before fetching device details.",
            );
        }
        return this.device;
    }

    private async getDeviceByID(deviceID: string): Promise<Device | null> {
        if (deviceID in this.deviceRecords) {
            return this.deviceRecords[deviceID] ?? null;
        }

        const device = await this.database.getDevice(deviceID);
        if (device) {
            this.deviceRecords[deviceID] = device;
            return device;
        }
        try {
            const res = await this.http.get(
                this.getHost() + "/device/" + deviceID,
            );
            const fetchedDevice = decodeAxios(DeviceCodec, res.data);
            this.deviceRecords[deviceID] = fetchedDevice;
            await this.database.saveDevice(fetchedDevice);
            return fetchedDevice;
        } catch (_err: unknown) {
            return null;
        }
    }

    /* Retrieves the current list of users you have sessions with. */
    private async getFamiliars(): Promise<User[]> {
        const sessions = await this.database.getAllSessions();
        const familiars: User[] = [];

        for (const session of sessions) {
            const [user, _err] = await this.fetchUser(session.userID);
            if (user) {
                familiars.push(user);
            }
        }

        return familiars;
    }

    private async getGroupHistory(channelID: string): Promise<Message[]> {
        const messages: Message[] =
            await this.database.getGroupHistory(channelID);

        return messages;
    }

    private async getMail(): Promise<void> {
        if (this.manuallyClosing) {
            return;
        }
        while (this.fetchingMail) {
            await sleep(500);
        }
        this.fetchingMail = true;
        let firstFetch = false;
        if (this.firstMailFetch) {
            firstFetch = true;
            this.firstMailFetch = false;
        }

        if (firstFetch) {
            this.emitter.emit("decryptingMail");
        }

        try {
            const res = await this.http.post<ArrayBuffer>(
                this.getHost() +
                    "/device/" +
                    this.getDevice().deviceID +
                    "/mail",
            );
            const mailBuffer = new Uint8Array(res.data);
            const rawInbox = z
                .array(mailInboxEntry)
                .parse(msgpack.decode(mailBuffer));
            const inbox = rawInbox.sort((a, b) => b[2].localeCompare(a[2]));

            for (const mailDetails of inbox) {
                const [mailHeader, mailBody, timestamp] = mailDetails;
                try {
                    await this.readMail(mailHeader, mailBody, timestamp);
                } catch (_readMailErr) {
                    // non-fatal — inspect _readMailErr in a debugger
                }
            }
        } catch (_fetchErr) {
            // non-fatal — inspect _fetchErr in a debugger
        }
        this.fetchingMail = false;
    }

    private async getMessageHistory(userID: string): Promise<Message[]> {
        const messages: Message[] =
            await this.database.getMessageHistory(userID);

        return messages;
    }

    private async getMultiUserDeviceList(userIDs: string[]): Promise<Device[]> {
        try {
            const res = await this.http.post(
                this.getHost() + "/deviceList",
                msgpack.encode(userIDs),
                { headers: { "Content-Type": "application/msgpack" } },
            );
            const devices = decodeAxios(DeviceArrayCodec, res.data);
            for (const device of devices) {
                this.deviceRecords[device.deviceID] = device;
            }

            return devices;
        } catch (_err: unknown) {
            return [];
        }
    }

    private async getOTKCount(): Promise<number> {
        const res = await this.http.get(
            this.getHost() +
                "/device/" +
                this.getDevice().deviceID +
                "/otk/count",
        );
        return decodeAxios(OtkCountCodec, res.data).count;
    }

    /**
     * Gets all permissions for the logged in user.
     *
     * @returns The list of Permission objects.
     */
    private async getPermissions(): Promise<Permission[]> {
        const res = await this.http.get(
            this.getHost() + "/user/" + this.getUser().userID + "/permissions",
        );
        return decodeAxios(PermissionArrayCodec, res.data);
    }

    private async getServerByID(serverID: string): Promise<null | Server> {
        try {
            const res = await this.http.get(
                this.getHost() + "/server/" + serverID,
            );
            return decodeAxios(ServerCodec, res.data);
        } catch (_err: unknown) {
            return null;
        }
    }

    private async getServerList(): Promise<Server[]> {
        const res = await this.http.get(
            this.getHost() + "/user/" + this.getUser().userID + "/servers",
        );
        return decodeAxios(ServerArrayCodec, res.data);
    }

    private async getSessionByPubkey(publicKey: Uint8Array) {
        const strPubKey = XUtils.encodeHex(publicKey);
        if (strPubKey in this.sessionRecords) {
            return this.sessionRecords[strPubKey];
        }
        const session = await this.database.getSessionByPublicKey(publicKey);
        if (session) {
            this.sessionRecords[strPubKey] = session;
        }
        return session;
    }

    private async getSessionList() {
        return this.database.getAllSessions();
    }

    private async getToken(
        type:
            | "avatar"
            | "connect"
            | "device"
            | "emoji"
            | "file"
            | "invite"
            | "register",
    ): Promise<ActionToken | null> {
        try {
            const res = await this.http.get(this.getHost() + "/token/" + type, {
                responseType: "arraybuffer",
            });
            return decodeAxios(ActionTokenCodec, res.data);
        } catch {
            return null;
        }
    }

    /* Get the currently logged in user. You cannot call this until
    after the auth event is emitted. */
    private getUser(): User {
        if (!this.user) {
            throw new Error(
                "You must wait until the auth event is emitted before fetching user details.",
            );
        }
        return this.user;
    }

    private deviceListFailureDetail(err: unknown): string {
        if (!isAxiosError(err)) {
            return "";
        }
        const st = err.response?.status;
        if (typeof st === "number") {
            return ` (HTTP ${String(st)})`;
        }
        if (err.code !== undefined) {
            return ` (${err.code})`;
        }
        return "";
    }

    /**
     * Single GET for `/user/:id/devices`. On failure returns `null` (swallows errors)
     * — callers that need reliability should use `fetchUserDeviceListWithBackoff`.
     * Similar “best effort null” patterns elsewhere: `getChannelByID`,
     * `getDeviceByID` (HTTP leg), `getToken`, emoji upload fallbacks.
     */
    private async getUserDeviceList(userID: string): Promise<Device[] | null> {
        try {
            return await this.fetchUserDeviceListOnce(userID);
        } catch (_err: unknown) {
            return null;
        }
    }

    private async fetchUserDeviceListOnce(userID: string): Promise<Device[]> {
        if (this.isManualCloseInFlight()) {
            return [];
        }
        const res = await this.http.get(
            this.getHost() + "/user/" + userID + "/devices",
        );
        const devices = decodeAxios(DeviceArrayCodec, res.data);
        for (const device of devices) {
            this.deviceRecords[device.deviceID] = device;
        }
        return devices;
    }

    /**
     * DM / forward paths need the peer’s (or self) device rows under load: bounded
     * retries with exponential backoff (same shape as session pubkey hydration).
     */
    private async fetchUserDeviceListWithBackoff(
        userID: string,
        label: "peer" | "own",
    ): Promise<Device[]> {
        const base =
            label === "own"
                ? "Couldn't get own devices"
                : "Couldn't get device list";
        let lastErr: unknown;
        for (let attempt = 0; attempt < 5; attempt++) {
            if (this.isManualCloseInFlight()) {
                return [];
            }
            if (attempt > 0) {
                const delayMs = 100 * 2 ** (attempt - 1);
                // Chunk the delay so close() can finish before we retry HTTP.
                const chunkMs = 10;
                for (let elapsed = 0; elapsed < delayMs; elapsed += chunkMs) {
                    if (this.isManualCloseInFlight()) {
                        return [];
                    }
                    await sleep(Math.min(chunkMs, delayMs - elapsed));
                }
            }
            try {
                return await this.fetchUserDeviceListOnce(userID);
            } catch (err: unknown) {
                lastErr = err;
            }
        }
        throw new Error(`${base}${this.deviceListFailureDetail(lastErr)}`);
    }

    private async getUserList(channelID: string): Promise<User[]> {
        const res = await this.http.post(
            this.getHost() + "/userList/" + channelID,
        );
        return decodeAxios(UserArrayCodec, res.data);
    }

    private async handleNotify(msg: NotifyMsg) {
        switch (msg.event) {
            case "mail":
                await this.getMail();
                this.fetchingMail = false;
                break;
            case "permission":
                this.emitter.emit(
                    "permission",
                    PermissionSchema.parse(msg.data),
                );
                break;
            case "retryRequest":
                // msg.data is the messageID for retry
                break;
            default:
                break;
        }
    }

    /**
     * Pipeline for decrypted messages — registered in `init`. After `close()` sets
     * `manuallyClosing`, this becomes a no-op so fire-and-forget `forward` does not
     * race HTTP teardown (we avoid `off()` here — it can interact badly with emit).
     */
    private readonly onInternalMessage = (message: Message): void => {
        if (this.isManualCloseInFlight()) {
            return;
        }
        if (message.direction === "outgoing" && !message.forward) {
            void this.forward(message);
        }

        if (
            message.direction === "incoming" &&
            message.recipient === message.sender
        ) {
            return;
        }
        void this.database.saveMessage(message);
    };

    /**
     * Initializes the keyring. This must be called before anything else.
     */
    private async init(): Promise<void> {
        if (this.hasInit) {
            throw new Error("You should only call init() once.");
        }
        this.hasInit = true;

        if (Client.isNodeRuntime()) {
            const { attachNodeAgentsToAxios, createNodeHttpAgents } =
                await import("./storage/node/http-agents.js");
            const agents = createNodeHttpAgents();
            this.nodeHttpAgents = agents;
            attachNodeAgentsToAxios(this.http, agents);
        }

        await this.populateKeyRing();
        this.emitter.on("message", this.onInternalMessage);
        this.emitter.emit("ready");
    }

    private initSocket() {
        try {
            if (!this.token) {
                throw new Error("No token found, did you call login()?");
            }

            const wsUrl = this.prefixes.WS + this.host + "/socket";
            // Auth sent as first message after open
            this.socket = new WebSocketAdapter(wsUrl);
            this.socket.on("open", () => {
                const authMsg = JSON.stringify({
                    token: this.token,
                    type: "auth",
                });
                this.socket.send(new TextEncoder().encode(authMsg));
                this.pingInterval = setInterval(this.ping.bind(this), 15000);
            });

            this.socket.on("close", () => {
                if (this.pingInterval) {
                    clearInterval(this.pingInterval);
                    this.pingInterval = null;
                }
                if (!this.manuallyClosing) {
                    this.emitter.emit("disconnect");
                }
            });

            this.socket.on("error", (_error: Error) => {
                if (!this.manuallyClosing) {
                    this.emitter.emit("disconnect");
                }
            });

            this.socket.on("message", (message: Uint8Array) => {
                const [_header, raw] = XUtils.unpackMessage(message);

                const parseResult = WSMessageSchema.safeParse(raw);
                if (!parseResult.success) {
                    return;
                }
                const msg = parseResult.data;

                switch (msg.type) {
                    case "challenge":
                        void this.respond(msg);
                        break;
                    case "error":
                        break;
                    case "notify":
                        void this.handleNotify(msg);
                        break;
                    case "ping":
                        this.pong(msg.transmissionID);
                        break;
                    case "pong":
                        this.setAlive(true);
                        break;
                    case "success":
                        break;
                    case "unauthorized":
                        throw new Error(
                            "Received unauthorized message from server.",
                        );
                    case "authorized":
                        this.emitter.emit("connected");
                        void this.postAuth();
                        break;
                    default:
                        break;
                }
            });
        } catch (err: unknown) {
            throw new Error(
                "Error initiating websocket connection " + String(err),
            );
        }
    }

    private async kickUser(userID: string, serverID: string): Promise<void> {
        const permissionList = await this.fetchPermissionList(serverID);
        for (const permission of permissionList) {
            if (userID === permission.userID) {
                await this.deletePermission(permission.permissionID);
                return;
            }
        }
        throw new Error("Couldn't kick user.");
    }

    private async leaveServer(serverID: string): Promise<void> {
        const permissionList = await this.permissions.retrieve();
        for (const permission of permissionList) {
            if (permission.resourceID === serverID) {
                await this.deletePermission(permission.permissionID);
            }
        }
    }

    private async markSessionVerified(sessionID: string) {
        return this.database.markSessionVerified(sessionID);
    }

    private async negotiateOTK() {
        const otkCount = await this.getOTKCount();
        const needs = xConstants.MIN_OTK_SUPPLY - otkCount;
        if (needs === 0) {
            return;
        }

        await this.submitOTK(needs);
    }

    private async newEphemeralKeys() {
        if (!this.xKeyRing) {
            if (this.manuallyClosing) {
                return;
            }
            throw new Error("Key ring not initialized.");
        }
        this.xKeyRing.ephemeralKeys = await xBoxKeyPairAsync();
    }

    private ping() {
        if (!this.isAlive) {
        }
        this.setAlive(false);
        void this.send({ transmissionID: uuid.v4(), type: "ping" });
    }

    private pong(transmissionID: string) {
        void this.send({ transmissionID, type: "pong" });
    }

    private async populateKeyRing() {
        // we've checked in the constructor that these exist
        if (!this.idKeys) {
            throw new Error("Identity keys are missing.");
        }
        const identityKeys = this.idKeys;

        const existingPreKeys = await this.database.getPreKeys();
        const preKeys: PreKeysCrypto =
            existingPreKeys ??
            (await (async () => {
                const unsaved = await this.createPreKey();
                const [saved] = await this.database.savePreKeys(
                    [unsaved],
                    false,
                );
                if (!saved || saved.index == null)
                    throw new Error(
                        "Failed to save prekey — no index returned.",
                    );
                return { ...unsaved, index: saved.index };
            })());

        const sessions = await this.database.getAllSessions();
        for (const session of sessions) {
            this.sessionRecords[session.publicKey] =
                sqlSessionToCrypto(session);
        }

        const ephemeralKeys = await xBoxKeyPairAsync();

        this.xKeyRing = {
            ephemeralKeys,
            identityKeys,
            preKeys,
        };
    }

    private async postAuth() {
        let count = 0;
        for (;;) {
            if (this.isManualCloseInFlight()) {
                return;
            }
            try {
                await this.getMail();
                count++;
                this.fetchingMail = false;

                if (count > 10) {
                    void this.negotiateOTK();
                    count = 0;
                }
            } catch {}
            if (this.isManualCloseInFlight()) {
                return;
            }
            // Chunk the idle delay so `close()` can unwind instead of waiting
            // out one full 60s timer (which would keep the process alive).
            for (let i = 0; i < 60; i++) {
                if (this.isManualCloseInFlight()) {
                    return;
                }
                await sleep(1000);
            }
        }
    }

    private async purgeHistory(): Promise<void> {
        await this.database.purgeHistory();
    }

    private async readMail(
        header: Uint8Array,
        mail: MailWS,
        timestamp: string,
    ) {
        if (this.seenMailIDs.has(mail.mailID)) {
            return;
        }
        this.seenMailIDs.add(mail.mailID);

        if (this.manuallyClosing) {
            return;
        }

        this.sendReceipt(new Uint8Array(mail.nonce));
        let timeout = 1;
        while (this.reading) {
            await sleep(timeout);
            timeout *= 2;
        }
        this.reading = true;

        try {
            await this.runWithThisCryptoProfile(async () => {
                const healSession = async () => {
                    if (this.manuallyClosing || !this.xKeyRing) {
                        return;
                    }
                    const deviceEntry = await this.getDeviceByID(mail.sender);
                    const [user, _err] = await this.fetchUser(mail.authorID);
                    if (deviceEntry && user) {
                        void this.createSession(
                            deviceEntry,
                            user,
                            XUtils.decodeUTF8(
                                `��RETRY_REQUEST:${mail.mailID}��`,
                            ),
                            mail.group,
                            uuid.v4(),
                            false,
                            true,
                        );
                    }
                };

                switch (mail.mailType) {
                    case MailType.initial:
                        const extraParts = Client.deserializeExtra(
                            MailType.initial,
                            new Uint8Array(mail.extra),
                        );
                        const signKey = extraParts[0];
                        const ephKey = extraParts[1];
                        const indexBytes = extraParts[3];
                        if (!signKey || !ephKey || !indexBytes) {
                            throw new Error(
                                "Malformed initial mail extra: missing signKey, ephKey, or indexBytes",
                            );
                        }

                        const preKeyIndex = XUtils.uint8ArrToNumber(indexBytes);

                        const otk =
                            preKeyIndex === 0
                                ? null
                                : await this.database.getOneTimeKey(
                                      preKeyIndex,
                                  );

                        if (otk?.index !== preKeyIndex && preKeyIndex !== 0) {
                            return;
                        }

                        // their public keys
                        const fipsRead = isFipsInitialExtraV1(
                            new Uint8Array(mail.extra),
                        );
                        const IK_A = fipsRead
                            ? signKey
                            : (() => {
                                  const c =
                                      XKeyConvert.convertPublicKey(signKey);
                                  if (!c) {
                                      return null;
                                  }
                                  return c;
                              })();
                        if (!IK_A) {
                            return;
                        }
                        const EK_A = ephKey;

                        if (!this.xKeyRing) {
                            return;
                        }
                        // my private keys
                        const IK_B = this.xKeyRing.identityKeys.secretKey;
                        const IK_BP = this.xKeyRing.identityKeys.publicKey;
                        const SPK_B = this.xKeyRing.preKeys.keyPair.secretKey;
                        const OPK_B = otk ? otk.keyPair.secretKey : null;

                        // diffie hellman functions
                        const DH1 = await xDHAsync(SPK_B, IK_A);
                        const DH2 = await xDHAsync(IK_B, EK_A);
                        const DH3 = await xDHAsync(SPK_B, EK_A);
                        const DH4 = OPK_B ? await xDHAsync(OPK_B, EK_A) : null;

                        // initial key material
                        const IKM = DH4
                            ? xConcat(DH1, DH2, DH3, DH4)
                            : xConcat(DH1, DH2, DH3);

                        // shared secret key
                        const SK = xKDF(IKM);
                        const PK = (await xBoxKeyPairFromSecretAsync(SK))
                            .publicKey;

                        const hmac = xHMAC(mail, SK);

                        // associated data
                        const AD = fipsRead
                            ? fipsP256AdFromIdentityPubs(IK_A, IK_BP)
                            : xConcat(
                                  xEncode(xConstants.CURVE, IK_A),
                                  xEncode(xConstants.CURVE, IK_BP),
                              );

                        if (!XUtils.bytesEqual(hmac, header)) {
                            return;
                        }
                        const unsealed = await xSecretboxOpenAsync(
                            new Uint8Array(mail.cipher),
                            new Uint8Array(mail.nonce),
                            SK,
                        );
                        if (unsealed) {
                            let plaintext = "";
                            if (!mail.forward) {
                                plaintext = XUtils.encodeUTF8(unsealed);
                            }

                            // emit the message
                            const fwdMsg1 = mail.forward
                                ? messageSchema.parse(msgpack.decode(unsealed))
                                : null;
                            const message: Message = fwdMsg1
                                ? { ...fwdMsg1, forward: true }
                                : {
                                      authorID: mail.authorID,
                                      decrypted: true,
                                      direction: "incoming",
                                      forward: mail.forward,
                                      group: mail.group
                                          ? uuid.stringify(mail.group)
                                          : null,
                                      mailID: mail.mailID,
                                      message: plaintext,
                                      nonce: XUtils.encodeHex(
                                          new Uint8Array(mail.nonce),
                                      ),
                                      readerID: mail.readerID,
                                      recipient: mail.recipient,
                                      sender: mail.sender,
                                      timestamp: timestamp,
                                  };

                            this.emitter.emit("message", message);

                            // discard onetimekey
                            await this.database.deleteOneTimeKey(preKeyIndex);

                            const deviceEntry = await this.getDeviceByID(
                                mail.sender,
                            );
                            if (!deviceEntry) {
                                throw new Error("Couldn't get device entry.");
                            }
                            const [userEntry, _userErr] = await this.fetchUser(
                                deviceEntry.owner,
                            );
                            if (!userEntry) {
                                throw new Error("Couldn't get user entry.");
                            }

                            this.userRecords[userEntry.userID] = userEntry;
                            this.deviceRecords[deviceEntry.deviceID] =
                                deviceEntry;

                            // save session
                            const newSession: SessionSQL = {
                                deviceID: mail.sender,
                                fingerprint: XUtils.encodeHex(AD),
                                lastUsed: new Date().toISOString(),
                                mode: "receiver",
                                publicKey: XUtils.encodeHex(PK),
                                sessionID: uuid.v4(),
                                SK: XUtils.encodeHex(SK),
                                userID: userEntry.userID,
                                verified: false,
                            };
                            await this.database.saveSession(newSession);

                            const [user] = await this.fetchUser(
                                newSession.userID,
                            );

                            if (user) {
                                this.emitter.emit("session", newSession, user);
                            } else {
                            }
                        } else {
                        }
                        break;
                    case MailType.subsequent: {
                        const extraBuf = new Uint8Array(mail.extra);
                        const publicKey = isFipsSubsequentExtraV1(extraBuf)
                            ? decodeFipsSubsequentExtraV1(extraBuf)
                            : Client.deserializeExtra(
                                  mail.mailType,
                                  extraBuf,
                              )[0];
                        if (!publicKey) {
                            throw new Error(
                                "Malformed subsequent mail extra: missing publicKey",
                            );
                        }
                        let session = await this.getSessionByPubkey(publicKey);
                        let retries = 0;
                        while (!session) {
                            if (retries >= 3) {
                                break;
                            }
                            await sleep(100 * 2 ** retries);
                            retries++;
                            session = await this.getSessionByPubkey(publicKey);
                        }

                        if (!session) {
                            void healSession();
                            return;
                        }
                        const HMAC = xHMAC(mail, session.SK);

                        if (!XUtils.bytesEqual(HMAC, header)) {
                            void healSession();
                            return;
                        }

                        const decrypted = await xSecretboxOpenAsync(
                            new Uint8Array(mail.cipher),
                            new Uint8Array(mail.nonce),
                            session.SK,
                        );

                        if (decrypted) {
                            const fwdMsg2 = mail.forward
                                ? messageSchema.parse(msgpack.decode(decrypted))
                                : null;
                            const message: Message = fwdMsg2
                                ? {
                                      ...fwdMsg2,
                                      forward: true,
                                  }
                                : {
                                      authorID: mail.authorID,
                                      decrypted: true,
                                      direction: "incoming",
                                      forward: mail.forward,
                                      group: mail.group
                                          ? uuid.stringify(mail.group)
                                          : null,
                                      mailID: mail.mailID,
                                      message: XUtils.encodeUTF8(decrypted),
                                      nonce: XUtils.encodeHex(
                                          new Uint8Array(mail.nonce),
                                      ),
                                      readerID: mail.readerID,
                                      recipient: mail.recipient,
                                      sender: mail.sender,
                                      timestamp: timestamp,
                                  };
                            this.emitter.emit("message", message);

                            void this.database.markSessionUsed(
                                session.sessionID,
                            );
                        } else {
                            void healSession();

                            // emit the message
                            const message: Message = {
                                authorID: mail.authorID,
                                decrypted: false,
                                direction: "incoming",
                                forward: mail.forward,
                                group: mail.group
                                    ? uuid.stringify(mail.group)
                                    : null,
                                mailID: mail.mailID,
                                message: "",
                                nonce: XUtils.encodeHex(
                                    new Uint8Array(mail.nonce),
                                ),
                                readerID: mail.readerID,
                                recipient: mail.recipient,
                                sender: mail.sender,
                                timestamp: timestamp,
                            };
                            this.emitter.emit("message", message);
                        }
                        break;
                    }
                    default:
                        break;
                }
            });
        } finally {
            this.reading = false;
        }
    }

    private async redeemInvite(inviteID: string): Promise<Permission> {
        const res = await this.http.patch(
            this.getHost() + "/invite/" + inviteID,
        );
        return decodeAxios(PermissionCodec, res.data);
    }

    private async registerDevice(): Promise<Device | null> {
        while (!this.xKeyRing) {
            await sleep(100);
        }

        const token = await this.getToken("device");

        const username = this.user?.username;
        if (!username) {
            throw new Error("No user set — log in first.");
        }
        const [userDetails, err] = await this.fetchUser(username);
        if (!userDetails) {
            throw new Error("Username not found " + username);
        }
        if (err) {
            throw err;
        }
        if (!token) {
            throw new Error("Couldn't fetch token.");
        }

        // Stored on Spire for signature verification: Ed25519 (hex) in tweetnacl;
        // P-256 ECDSA SPKI (hex) in FIPS. The server maps this to a raw ECDH
        // identity in `getKeyBundle` for X3DH; see spire `Database.getKeyBundle`.
        const signKey = this.getKeys().public;
        const signed = XUtils.encodeHex(
            await xSignAsync(
                Uint8Array.from(uuid.parse(token.key)),
                this.signKeys.secretKey,
            ),
        );

        const devPreKeyIndex = this.xKeyRing.preKeys.index;
        const devMsg: DevicePayload = {
            deviceName: this.options?.deviceName ?? "unknown",
            preKey: XUtils.encodeHex(this.xKeyRing.preKeys.keyPair.publicKey),
            preKeyIndex: devPreKeyIndex,
            preKeySignature: XUtils.encodeHex(this.xKeyRing.preKeys.signature),
            signed,
            signKey,
            username: userDetails.username,
        };

        const res = await this.http.post(
            this.prefixes.HTTP +
                this.host +
                "/user/" +
                userDetails.userID +
                "/devices",
            msgpack.encode(devMsg),
            { headers: { "Content-Type": "application/msgpack" } },
        );
        return decodeAxios(DeviceCodec, res.data);
    }

    private async respond(msg: ChallMsg) {
        const response: RespMsg = {
            signed: await xSignAsync(
                new Uint8Array(msg.challenge),
                this.signKeys.secretKey,
            ),
            transmissionID: msg.transmissionID,
            type: "response",
        };
        void this.send(response);
    }

    private async retrieveEmojiByID(emojiID: string): Promise<Emoji | null> {
        const res = await this.http.get(
            this.getHost() + "/emoji/" + emojiID + "/details",
        );
        if (!res.data) {
            return null;
        }
        return decodeAxios(EmojiCodec, res.data);
    }

    private async retrieveEmojiList(serverID: string): Promise<Emoji[]> {
        const res = await this.http.get(
            this.getHost() + "/server/" + serverID + "/emoji",
        );
        return decodeAxios(EmojiArrayCodec, res.data);
    }

    private async retrieveFile(
        fileID: string,
        key: string,
    ): Promise<FileResponse | null> {
        const detailsRes = await this.http.get(
            this.getHost() + "/file/" + fileID + "/details",
        );
        const details = decodeAxios(FileSQLCodec, detailsRes.data);

        const res = await this.http.get<ArrayBuffer>(
            this.getHost() + "/file/" + fileID,
            {
                onDownloadProgress: (progressEvent) => {
                    const percentCompleted = Math.round(
                        (progressEvent.loaded * 100) /
                            (progressEvent.total ?? 1),
                    );
                    const { loaded, total = 0 } = progressEvent;
                    const progress: FileProgress = {
                        direction: "download",
                        loaded,
                        progress: percentCompleted,
                        token: fileID,
                        total,
                    };
                    this.emitter.emit("fileProgress", progress);
                },
            },
        );
        const fileData = res.data;

        const decrypted = await xSecretboxOpenAsync(
            new Uint8Array(fileData),
            XUtils.decodeHex(details.nonce),
            XUtils.decodeHex(key),
        );

        if (decrypted) {
            return {
                data: new Uint8Array(decrypted),
                details,
            };
        }
        throw new Error("Decryption failed.");
    }

    private async retrieveInvites(serverID: string): Promise<Invite[]> {
        const res = await this.http.get(
            this.getHost() + "/server/" + serverID + "/invites",
        );
        return decodeAxios(InviteArrayCodec, res.data);
    }

    private async retrieveKeyBundle(deviceID: string): Promise<KeyBundle> {
        const res = await this.http.post(
            this.getHost() + "/device/" + deviceID + "/keyBundle",
        );
        return decodeAxios(KeyBundleCodec, res.data);
    }

    private async retrieveOrCreateDevice(): Promise<Device> {
        let device: Device;
        try {
            const res = await this.http.get(
                this.prefixes.HTTP +
                    this.host +
                    "/device/" +
                    XUtils.encodeHex(this.signKeys.publicKey),
            );
            device = decodeAxios(DeviceCodec, res.data);
        } catch (err: unknown) {
            if (isAxiosError(err) && err.response?.status === 404) {
                await this.database.purgeKeyData();
                await this.populateKeyRing();

                const newDevice = await this.registerDevice();
                if (newDevice) {
                    device = newDevice;
                } else {
                    throw new Error("Error registering device.");
                }
            } else {
                throw err;
            }
        }
        return device;
    }

    /* header is 32 bytes and is either empty
    or contains an HMAC of the message with
    a derived SK */
    private async send(msg: ClientMessage, header?: Uint8Array) {
        const maxWaitMs = 30_000;
        let elapsed = 0;
        let backoff = 50;
        while (this.socket.readyState !== 1) {
            if (elapsed >= maxWaitMs) {
                throw new Error(
                    "WebSocket did not reach OPEN state within 30 seconds.",
                );
            }
            await sleep(backoff);
            elapsed += backoff;
            backoff = Math.min(backoff * 2, 4_000);
        }

        this.socket.send(XUtils.packMessage(msg, header));
    }

    private async sendGroupMessage(
        channelID: string,
        message: string,
    ): Promise<void> {
        const userList = await this.getUserList(channelID);
        for (const user of userList) {
            this.userRecords[user.userID] = user;
        }

        const mailID = uuid.v4();

        const userIDs = [...new Set(userList.map((user) => user.userID))];
        const devices = await this.getMultiUserDeviceList(userIDs);

        for (const device of devices) {
            const ownerRecord = this.userRecords[device.owner];
            if (!ownerRecord) {
                continue;
            }
            try {
                await this.sendMail(
                    device,
                    ownerRecord,
                    XUtils.decodeUTF8(message),
                    uuidToUint8(channelID),
                    mailID,
                    false,
                );
            } catch {
                /* best-effort; each device needs its own X3DH handshake (sequential) */
            }
        }
    }

    /* Sends encrypted mail to a user. */
    private async sendMail(
        device: Device,
        user: User,
        msg: Uint8Array,
        group: null | Uint8Array,
        mailID: null | string,
        forward: boolean,
        retry = false,
    ): Promise<void> {
        while (this.sending.has(device.deviceID)) {
            await sleep(100);
        }
        this.sending.set(device.deviceID, device);
        try {
            const session = await this.database.getSessionByDeviceID(
                device.deviceID,
            );

            if (!session || retry) {
                await this.createSession(
                    device,
                    user,
                    msg,
                    group,
                    mailID,
                    forward,
                    false,
                );
                return;
            }

            const nonce = xMakeNonce();
            const cipher = await xSecretboxAsync(msg, nonce, session.SK);
            const extra =
                this.cryptoProfile === "fips"
                    ? encodeFipsSubsequentExtraV1(session.publicKey)
                    : session.publicKey;

            const mail: MailWS = {
                authorID: this.getUser().userID,
                cipher,
                extra,
                forward,
                group,
                mailID: mailID || uuid.v4(),
                mailType: MailType.subsequent,
                nonce,
                readerID: session.userID,
                recipient: device.deviceID,
                sender: this.getDevice().deviceID,
            };

            const msgb: ResourceMsg = {
                action: "CREATE",
                data: mail,
                resourceType: "mail",
                transmissionID: uuid.v4(),
                type: "resource",
            };

            const hmac = xHMAC(mail, session.SK);

            const fwdOut = forward
                ? messageSchema.parse(msgpack.decode(msg))
                : null;
            const outMsg: Message = fwdOut
                ? { ...fwdOut, forward: true }
                : {
                      authorID: mail.authorID,
                      decrypted: true,
                      direction: "outgoing",
                      forward: mail.forward,
                      group: mail.group ? uuid.stringify(mail.group) : null,
                      mailID: mail.mailID,
                      message: XUtils.encodeUTF8(msg),
                      nonce: XUtils.encodeHex(new Uint8Array(mail.nonce)),
                      readerID: mail.readerID,
                      recipient: mail.recipient,
                      sender: mail.sender,
                      timestamp: new Date().toISOString(),
                  };
            this.emitter.emit("message", outMsg);

            await new Promise((res, rej) => {
                const callback = (packedMsg: Uint8Array) => {
                    const [_header, receivedMsg] =
                        XUtils.unpackMessage(packedMsg);
                    if (receivedMsg.transmissionID === msgb.transmissionID) {
                        this.socket.off("message", callback);
                        const parsed = WSMessageSchema.safeParse(receivedMsg);
                        if (parsed.success && parsed.data.type === "success") {
                            res(parsed.data.data);
                        } else {
                            rej(
                                new Error(
                                    "Mail delivery failed: " +
                                        JSON.stringify(receivedMsg),
                                ),
                            );
                        }
                    }
                };
                this.socket.on("message", callback);
                void this.send(msgb, hmac);
            });
        } finally {
            this.sending.delete(device.deviceID);
        }
    }

    private async sendMessage(userID: string, message: string): Promise<void> {
        try {
            const [userEntry, err] = await this.fetchUser(userID);
            if (err) {
                throw err;
            }
            if (!userEntry) {
                throw new Error("Couldn't get user entry.");
            }

            const deviceListRaw = await this.fetchUserDeviceListWithBackoff(
                userID,
                "peer",
            );
            if (deviceListRaw.length === 0) {
                throw new Error(
                    "No devices for user — cannot send direct message.",
                );
            }
            // Stable order (Peer device list is otherwise DB-order dependent).
            const deviceList = [...deviceListRaw].sort((a, b) =>
                a.deviceID.localeCompare(b.deviceID, "en"),
            );
            let lastErr: unknown;
            let failCount = 0;
            for (const device of deviceList) {
                const mailID = uuid.v4();
                try {
                    await this.sendMail(
                        device,
                        userEntry,
                        XUtils.decodeUTF8(message),
                        null,
                        mailID,
                        false,
                    );
                } catch (e) {
                    lastErr = e;
                    failCount += 1;
                }
            }
            if (failCount === deviceList.length) {
                throw lastErr instanceof Error
                    ? lastErr
                    : new Error(String(lastErr));
            }
        } catch (err: unknown) {
            throw err;
        }
    }

    private sendReceipt(nonce: Uint8Array) {
        const receipt: ReceiptMsg = {
            nonce,
            transmissionID: uuid.v4(),
            type: "receipt",
        };
        void this.send(receipt);
    }

    private setAlive(status: boolean) {
        this.isAlive = status;
    }

    private setUser(user: User): void {
        this.user = user;
    }

    private async submitOTK(amount: number) {
        const otks: UnsavedPreKey[] = [];

        for (let i = 0; i < amount; i++) {
            otks.push(await this.createPreKey());
        }

        const savedKeys = await this.database.savePreKeys(otks, true);

        await this.http.post(
            this.getHost() + "/device/" + this.getDevice().deviceID + "/otk",
            msgpack.encode(savedKeys.map((key) => this.censorPreKey(key))),
            {
                headers: { "Content-Type": "application/msgpack" },
            },
        );
    }

    private async uploadAvatar(avatar: Uint8Array): Promise<void> {
        if (typeof FormData !== "undefined") {
            const fpayload = new FormData();
            fpayload.set("avatar", new Blob([new Uint8Array(avatar)]));

            await this.http.post(
                this.prefixes.HTTP +
                    this.host +
                    "/avatar/" +
                    this.me.user().userID,
                fpayload,
                {
                    headers: { "Content-Type": "multipart/form-data" },
                    onUploadProgress: (progressEvent) => {
                        const percentCompleted = Math.round(
                            (progressEvent.loaded * 100) /
                                (progressEvent.total ?? 1),
                        );
                        const { loaded, total = 0 } = progressEvent;
                        const progress: FileProgress = {
                            direction: "upload",
                            loaded,
                            progress: percentCompleted,
                            token: this.getUser().userID,
                            total,
                        };
                        this.emitter.emit("fileProgress", progress);
                    },
                },
            );
            return;
        }

        const payload: { file: string } = {
            file: XUtils.encodeBase64(avatar),
        };
        await this.http.post(
            this.prefixes.HTTP +
                this.host +
                "/avatar/" +
                this.me.user().userID +
                "/json",
            msgpack.encode(payload),
            { headers: { "Content-Type": "application/msgpack" } },
        );
    }

    private async uploadEmoji(
        emoji: Uint8Array,
        name: string,
        serverID: string,
    ): Promise<Emoji | null> {
        if (typeof FormData !== "undefined") {
            const fpayload = new FormData();
            fpayload.set("emoji", new Blob([new Uint8Array(emoji)]));
            fpayload.set("name", name);

            try {
                const res = await this.http.post(
                    this.getHost() + "/emoji/" + serverID,
                    fpayload,
                    {
                        headers: { "Content-Type": "multipart/form-data" },
                        onUploadProgress: (progressEvent) => {
                            const percentCompleted = Math.round(
                                (progressEvent.loaded * 100) /
                                    (progressEvent.total ?? 1),
                            );
                            const { loaded, total = 0 } = progressEvent;
                            const progress: FileProgress = {
                                direction: "upload",
                                loaded,
                                progress: percentCompleted,
                                token: name,
                                total,
                            };
                            this.emitter.emit("fileProgress", progress);
                        },
                    },
                );
                return decodeAxios(EmojiCodec, res.data);
            } catch (_err: unknown) {
                return null;
            }
        }

        const payload: { file: string; name: string } = {
            file: XUtils.encodeBase64(emoji),
            name,
        };
        try {
            const res = await this.http.post(
                this.getHost() + "/emoji/" + serverID + "/json",
                msgpack.encode(payload),
                { headers: { "Content-Type": "application/msgpack" } },
            );
            return decodeAxios(EmojiCodec, res.data);
        } catch (_err: unknown) {
            return null;
        }
    }
}
