// tslint:disable: no-empty-interface

import type { IStorage } from "./IStorage.js";
import type {
    IClientAdapters,
    ILogger,
    IWebSocketLike,
} from "./transport/types.js";
import type {
    IPreKeysCrypto,
    ISessionCrypto,
    IXKeyRing,
} from "./types/index.js";
import type {
    IActionToken,
    IChallMsg,
    IChannel,
    IDevice,
    IDevicePayload,
    IEmoji,
    IFileResponse,
    IFileSQL,
    IInvite,
    IKeyBundle,
    IMailWS,
    INotifyMsg,
    IPermission,
    IPreKeysSQL,
    IPreKeysWS,
    IReceiptMsg,
    IRegistrationPayload,
    IResourceMsg,
    IRespMsg,
    IServer,
    ISessionSQL,
    ISuccessMsg,
} from "@vex-chat/types";
import type { AxiosInstance } from "axios";

import {
    xConcat,
    xConstants,
    xDH,
    xEncode,
    xHMAC,
    xKDF,
    XKeyConvert,
    xMakeNonce,
    xMnemonic,
    XUtils,
} from "@vex-chat/crypto";
import { MailType } from "@vex-chat/types";

import { sleep } from "@extrahash/sleep";
import axios, { type AxiosError } from "axios";
import { EventEmitter } from "eventemitter3";
import objectHash from "object-hash";
import pc from "picocolors";
import nacl from "tweetnacl";
import * as uuid from "uuid";

import { msgpack } from "./codec.js";
import { capitalize } from "./utils/capitalize.js";
import { formatBytes } from "./utils/formatBytes.js";
import { sqlSessionToCrypto } from "./utils/sqlSessionToCrypto.js";
import { uuidToUint8 } from "./utils/uint8uuid.js";

const protocolMsgRegex = /��\w+:\w+��/g;

// tslint:disable-next-line: interface-name
export declare interface Client {
    /**
     * This is emitted for file progress events.
     *
     * Example:
     *
     * ```ts
     *   client.on("ready", () => {
     *       await client.register()
     *   });
     * ```
     *
     * @event
     */
    on(
        event: "fileProgress",
        callback: (progress: IFileProgress) => void,
    ): this;

    /**
     * This is emitted whenever the keyring is done initializing after an init()
     * call. You must wait to login or register until after this event.
     *
     * Example:
     *
     * ```ts
     *   client.on("ready", () => {
     *       await client.register()
     *   });
     * ```
     *
     * @event
     */
    on(event: "ready", callback: () => void): this;

    /**
     * Emitted before the first inbox fetch/decrypt cycle after connect.
     *
     * Use this to show temporary loading UI while historical messages are
     * decrypted from server payloads.
     *
     * @event
     */
    // tslint:disable-next-line: unified-signatures
    on(event: "decryptingMail", callback: () => void): this;

    /**
     * This is emitted when you are connected to the chat.
     *
     * Example:
     *
     * ```ts
     *   client.on("connected", (user) => {
     *       // do something
     *   });
     * ```
     *
     * @event
     */
    // tslint:disable-next-line: unified-signatures
    on(event: "connected", callback: () => void): this;

    /**
     * This is emitted for every sent and received message.
     *
     * Example:
     *
     * ```ts
     *
     *   client.on("message", (msg: IMessage) => {
     *       console.log(message);
     *   });
     * ```
     * @event
     */
    on(event: "message", callback: (message: IMessage) => void): this;

    /**
     * This is emitted when the user is granted a new permission.
     *
     * Example:
     *
     * ```ts
     *
     *   client.on("permission", (perm: IPermission) => {
     *       console.log(perm);
     *   });
     * ```
     * @event
     */
    on(event: "permission", callback: (permission: IPermission) => void): this;

    /**
     * This is emitted for a new encryption session being created with
     * a specific user.
     *
     * Example:
     *
     * ```ts
     *
     *   client.on("session", (session: ISession, user: IUser) => {
     *       console.log(session);
     *       console.log(user);
     *   });
     * ```
     * @event
     */
    on(
        event: "session",
        callback: (session: ISession, user: IUser) => void,
    ): this;

    /**
     * This is emitted whenever the connection is closed. You must discard the client
     * and connect again with a fresh one.
     *
     * Example:
     * ```ts
     *
     *   client.on("disconnect", () => {
     *     // do something
     *   });
     * ```
     * @event
     */
    // tslint:disable-next-line: unified-signatures
    on(event: "disconnect", callback: () => void): this;

    /**
     * This is emitted whenever the close() event is called and completed successfully.
     * Note this is not fired for an unintentional disconnect, see the disconnect event.
     *
     * Example:
     *
     * ```ts
     *
     *   client.on("closed", () => {
     *       process.exit(0);
     *   });
     * ```
     *
     * @event
     */
    // tslint:disable-next-line: unified-signatures
    on(event: "closed", callback: () => void): this;
}

/**
 * IPermission is a permission to a resource.
 *
 * Common fields:
 * - `permissionID`: unique permission row ID
 * - `userID`: user receiving this grant
 * - `resourceID`: target server/channel/etc.
 * - `resourceType`: type string for the resource
 * - `powerLevel`: authorization level
 */
export type { IPermission } from "@vex-chat/types";

/**
 * @ignore
 */
export interface IChannels {
    /** Creates a channel in a server. */
    create: (name: string, serverID: string) => Promise<IChannel>;
    /** Deletes a channel. */
    delete: (channelID: string) => Promise<void>;
    /** Lists channels in a server. */
    retrieve: (serverID: string) => Promise<IChannel[]>;
    /** Gets one channel by ID. */
    retrieveByID: (channelID: string) => Promise<IChannel | null>;
    /** Lists users currently visible in a channel. */
    userList: (channelID: string) => Promise<IUser[]>;
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
export type { IDevice } from "@vex-chat/types";

/**
 * IClientOptions are the options you can pass into the client.
 */
export interface IClientOptions {
    /** Platform-specific adapters (WebSocket + Logger). When omitted, defaults to Node.js ws. */
    adapters?: IClientAdapters;
    /** Folder path where the sqlite file is created. */
    dbFolder?: string;
    /** Logging level for storage/database logs. */
    dbLogLevel?:
        | "debug"
        | "error"
        | "http"
        | "info"
        | "silly"
        | "verbose"
        | "warn";
    /** Platform label for device registration (e.g. "ios", "macos", "linux"). */
    deviceName?: string;
    /** API host without protocol. Defaults to `api.vex.wtf`. */
    host?: string;
    /** Use sqlite in-memory mode (`:memory:`) instead of a file. */
    inMemoryDb?: boolean;
    /** Logging level for client runtime logs. */
    logLevel?:
        | "debug"
        | "error"
        | "http"
        | "info"
        | "silly"
        | "verbose"
        | "warn";
    /** Whether local message history should be persisted by default storage. */
    saveHistory?: boolean;
    /** Use `http/ws` instead of `https/wss`. Intended for local/dev environments. */
    unsafeHttp?: boolean;
}

/**
 * @ignore
 */
export interface IDevices {
    /** Deletes one of the account's devices (except the currently active one). */
    delete: (deviceID: string) => Promise<void>;
    /** Registers the current key material as a new device. */
    register: () => Promise<IDevice | null>;
    /** Fetches one device by ID. */
    retrieve: (deviceIdentifier: string) => Promise<IDevice | null>;
}

/**
 * IChannel is a chat channel on a server.
 *
 * Common fields:
 * - `channelID`
 * - `serverID`
 * - `name`
 */
export type { IChannel } from "@vex-chat/types";

/**
 * IServer is a single chat server.
 *
 * Common fields:
 * - `serverID`
 * - `name`
 * - `icon` (optional URL/data)
 */
export type { IServer } from "@vex-chat/types";

/**
 * @ignore
 */
export interface IEmojis {
    /** Uploads a custom emoji to a server. */
    create: (
        emoji: Uint8Array,
        name: string,
        serverID: string,
    ) => Promise<IEmoji | null>;
    /** Fetches one emoji's metadata by ID. */
    retrieve: (emojiID: string) => Promise<IEmoji | null>;
    /** Lists emojis available on a server. */
    retrieveList: (serverID: string) => Promise<IEmoji[]>;
}

/**
 * IFile is an uploaded encrypted file.
 *
 * Common fields:
 * - `fileID`: file identifier
 * - `owner`: owner device/user ID
 * - `nonce`: file encryption nonce (hex)
 *
 * @example
 * ```ts
 * const file: IFile = {
 *     fileID: "bb1c3fd1-4928-48ab-9d09-3ea0972fbd9d",
 *     owner: "9b0f3f46-06ad-4bc4-8adf-4de10e13cb9c",
 *     nonce: "aa6c8d42f3fdd032a1e9fced4be379582d26ce8f69822d64",
 * };
 * ```
 */
export interface IFile extends IFileSQL {}

/**
 * Progress payload emitted by the `fileProgress` event.
 */
export interface IFileProgress {
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
 * IFileRes is a server response to a file retrieval request.
 *
 * Structure:
 * - `details`: metadata (`IFile`)
 * - `data`: decrypted binary bytes
 *
 * @example
 * ```ts
 * const response: IFileRes = {
 *     details: {
 *         fileID: "bb1c3fd1-4928-48ab-9d09-3ea0972fbd9d",
 *         owner: "9b0f3f46-06ad-4bc4-8adf-4de10e13cb9c",
 *         nonce: "aa6c8d42f3fdd032a1e9fced4be379582d26ce8f69822d64",
 *     },
 *     data: Buffer.from("hello"),
 * };
 * ```
 */
export interface IFileRes extends IFileResponse {}

/**
 * @ignore
 */
export interface IFiles {
    /** Uploads and encrypts a file. */
    create: (file: Uint8Array) => Promise<[IFileSQL, string]>;
    /** Downloads and decrypts a file using a file ID and key. */
    retrieve: (fileID: string, key: string) => Promise<IFileResponse | null>;
}

/**
 * @ignore
 */
export interface IInvites {
    /** Creates an invite for a server and duration. */
    create: (serverID: string, duration: string) => Promise<IInvite>;
    /** Redeems an invite and returns the created permission grant. */
    redeem: (inviteID: string) => Promise<IPermission>;
    /** Lists active invites for a server. */
    retrieve: (serverID: string) => Promise<IInvite[]>;
}

/**
 * IKeys are a pair of ed25519 public and private keys,
 * encoded as hex strings.
 */
export interface IKeys {
    /** Secret Ed25519 key as hex. Store securely. */
    private: string;
    /** Public Ed25519 key as hex. */
    public: string;
}

/**
 * @ignore
 */
export interface IMe {
    /** Returns metadata for the currently authenticated device. */
    device: () => IDevice;
    /** Uploads and sets a new avatar image for the current user. */
    setAvatar: (avatar: Uint8Array) => Promise<void>;
    /** Returns the currently authenticated user profile. */
    user: () => IUser;
}

/**
 * IMessage is a chat message.
 */
export interface IMessage {
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
    timestamp: Date;
}

/**
 * @ignore
 */
export interface IMessages {
    /** Deletes local history for a user/channel, optionally older than a duration. */
    delete: (userOrChannelID: string, duration?: string) => Promise<void>;
    /** Sends an encrypted message to all members of a channel. */
    group: (channelID: string, message: string) => Promise<void>;
    /** Deletes all locally stored message history. */
    purge: () => Promise<void>;
    /** Returns local direct-message history with one user. */
    retrieve: (userID: string) => Promise<IMessage[]>;
    /** Returns local group-message history for one channel. */
    retrieveGroup: (channelID: string) => Promise<IMessage[]>;
    /** Sends an encrypted direct message to one user. */
    send: (userID: string, message: string) => Promise<void>;
}

/**
 * @ignore
 */
export interface IModeration {
    /** Returns all permission entries for a server. */
    fetchPermissionList: (serverID: string) => Promise<IPermission[]>;
    /** Removes a user from a server by revoking their server permission(s). */
    kick: (userID: string, serverID: string) => Promise<void>;
}

/**
 * @ignore
 */
export interface IPermissions {
    /** Deletes one permission grant. */
    delete: (permissionID: string) => Promise<void>;
    /** Lists permissions granted to the authenticated user. */
    retrieve: () => Promise<IPermission[]>;
}

/**
 * @ignore
 */
export interface IServers {
    /** Creates a server. */
    create: (name: string) => Promise<IServer>;
    /** Deletes a server. */
    delete: (serverID: string) => Promise<void>;
    /** Leaves a server by removing the user's permission entry. */
    leave: (serverID: string) => Promise<void>;
    /** Lists servers available to the authenticated user. */
    retrieve: () => Promise<IServer[]>;
    /** Gets one server by ID. */
    retrieveByID: (serverID: string) => Promise<IServer | null>;
}

/**
 * ISession is an end to end encryption session with another peer.
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
 * const session: ISession = {
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
export interface ISession extends ISessionSQL {}

/**
 * @ignore
 */
export interface ISessions {
    /** Marks one session as verification-confirmed. */
    markVerified: (fingerprint: string) => Promise<void>;
    /** Returns all locally known sessions. */
    retrieve: () => Promise<ISessionSQL[]>;
    /** Builds a human-readable verification phrase from a session fingerprint. */
    verify: (session: ISessionSQL) => string;
}

/**
 * IUser is a single user on the vex platform.
 *
 * This is intentionally a censored user shape for client use, containing:
 * - `userID`
 * - `username`
 * - `lastSeen`
 */
export interface IUser {
    /** Last-seen timestamp (unix epoch milliseconds). */
    lastSeen: number;
    /** User identifier. */
    userID: string;
    /** Public username. */
    username: string;
}

/**
 * @ignore
 */
export interface IUsers {
    /** Returns users with whom the current device has active sessions. */
    familiars: () => Promise<IUser[]>;
    /**
     * Looks up a user by user ID, username, or signing key.
     */
    retrieve: (userID: string) => Promise<[IUser | null, AxiosError | null]>;
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
 *     const client = new Client(privateKey);
 *
 *     // the ready event is emitted when init() is finished.
 *     // you must wait until this event fires to perform
 *     // registration or login.
 *     client.on("ready", async () => {
 *         // you must register once before you can log in
 *         await client.register(Client.randomUsername());
 *         await client.login();
 *     })
 *
 *     // The authed event fires when login() successfully completes
 *     // and the server indicates you are authorized. You must wait to
 *     // perform any operations besides register() and login() until
 *     // this occurs.
 *     client.on("authed", async () => {
 *         const me = await client.users.me();
 *
 *         // send a message
 *         await client.messages.send(me.userID, "Hello world!");
 *     })
 *
 *     // Outgoing and incoming messages are emitted here.
 *     client.on("message", (message) => {
 *         console.log("message:", message);
 *     })
 *
 *     // you must call init() to initialize the keyring and
 *     // start the client.
 *     client.init();
 * }
 *
 * main();
 * ```
 */
export class Client extends EventEmitter {
    /**
     * Decrypts a secret key from encrypted data produced by encryptKeyData().
     *
     * Pass-through utility from `@vex-chat/crypto`.
     */
    public static decryptKeyData = XUtils.decryptKeyData;

    /**
     * Encrypts a secret key with a password.
     *
     * Pass-through utility from `@vex-chat/crypto`.
     */
    public static encryptKeyData = XUtils.encryptKeyData;

    /**
     * Channel operations.
     */
    public channels: IChannels = {
        /**
         * Creates a new channel in a server.
         * @param name: The channel name.
         * @param serverID: The unique serverID to create the channel in.
         *
         * @returns - The created IChannel object.
         */
        create: this.createChannel.bind(this),
        /**
         * Deletes a channel.
         * @param channelID: The unique channelID to delete.
         */
        delete: this.deleteChannel.bind(this),
        /**
         * Retrieves all channels in a server.
         *
         * @returns - The list of IChannel objects.
         */
        retrieve: this.getChannelList.bind(this),
        /**
         * Retrieves channel details by its unique channelID.
         *
         * @returns - The list of IChannel objects.
         */
        retrieveByID: this.getChannelByID.bind(this),
        /**
         * Retrieves a channel's userlist.
         * @param channelID: The channelID to retrieve userlist for.
         */
        userList: this.getUserList.bind(this),
    };

    /**
     * Device management methods.
     */
    public devices: IDevices = {
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
    public emoji: IEmojis = {
        create: this.uploadEmoji.bind(this),
        retrieve: this.retrieveEmojiByID.bind(this),
        retrieveList: this.retrieveEmojiList.bind(this),
    };

    /** File upload/download methods. */
    public files: IFiles = {
        /**
         * Uploads an encrypted file and returns the details and the secret key.
         * @param file: The file as a Buffer.
         *
         * @returns Details of the file uploaded and the key to encrypt in the form [details, key].
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
    public invites: IInvites = {
        create: this.createInvite.bind(this),
        redeem: this.redeemInvite.bind(this),
        retrieve: this.retrieveInvites.bind(this),
    };

    /**
     * Helpers for information/actions related to the currently authenticated account.
     */
    public me: IMe = {
        /**
         * Retrieves current device details
         *
         * @returns - The logged in device's IDevice object.
         */
        device: this.getDevice.bind(this),
        /**
         * Changes your avatar.
         */
        setAvatar: this.uploadAvatar.bind(this),
        /**
         * Retrieves your user information
         *
         * @returns - The logged in user's IUser object.
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
    public messages: IMessages = {
        delete: this.deleteHistory.bind(this),
        /**
         * Send a group message to a channel.
         * @param channelID: The channelID of the channel to send a message to.
         * @param message: The message to send.
         */
        group: this.sendGroupMessage.bind(this),
        purge: this.purgeHistory.bind(this),
        /**
         * Gets the message history with a specific userID.
         * @param userID: The userID of the user to retrieve message history for.
         *
         * @returns - The list of IMessage objects.
         */
        retrieve: this.getMessageHistory.bind(this),
        /**
         * Gets the group message history with a specific channelID.
         * @param chqnnelID: The channelID of the channel to retrieve message history for.
         *
         * @returns - The list of IMessage objects.
         */
        retrieveGroup: this.getGroupHistory.bind(this),
        /**
         * Send a direct message.
         * @param userID: The userID of the user to send a message to.
         * @param message: The message to send.
         */
        send: this.sendMessage.bind(this),
    };

    /**
     * Server moderation helper methods.
     */
    public moderation: IModeration = {
        fetchPermissionList: this.fetchPermissionList.bind(this),
        kick: this.kickUser.bind(this),
    };

    /**
     * Permission-management methods for the current user.
     */
    public permissions: IPermissions = {
        delete: this.deletePermission.bind(this),
        retrieve: this.getPermissions.bind(this),
    };

    public sending: Record<string, IDevice> = {};

    /**
     * Server operations.
     *
     * @example
     * ```ts
     * const servers = await client.servers.retrieve();
     * const created = await client.servers.create("Team Space");
     * ```
     */
    public servers: IServers = {
        /**
         * Creates a new server.
         * @param name: The server name.
         *
         * @returns - The created IServer object.
         */
        create: this.createServer.bind(this),
        /**
         * Deletes a server.
         * @param serverID: The unique serverID to delete.
         */
        delete: this.deleteServer.bind(this),
        leave: this.leaveServer.bind(this),
        /**
         * Retrieves all servers the logged in user has access to.
         *
         * @returns - The list of IServer objects.
         */
        retrieve: this.getServerList.bind(this),
        /**
         * Retrieves server details by its unique serverID.
         *
         * @returns - The requested IServer object, or null if the id does not exist.
         */
        retrieveByID: this.getServerByID.bind(this),
    };

    /**
     * Encryption-session helpers.
     */
    public sessions: ISessions = {
        /**
         * Marks a mnemonic verified, implying that the the user has confirmed
         * that the session mnemonic matches with the other user.
         * @param sessionID the sessionID of the session to mark.
         * @param status Optionally, what to mark it as. Defaults to true.
         */
        markVerified: this.markSessionVerified.bind(this),

        /**
         * Gets all encryption sessions.
         *
         * @returns - The list of ISession encryption sessions.
         */
        retrieve: this.getSessionList.bind(this),

        /**
         * Returns a mnemonic for the session, to verify with the other user.
         * @param session the ISession object to get the mnemonic for.
         *
         * @returns - The mnemonic representation of the session.
         */
        verify: Client.getMnemonic,
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
    public users: IUsers = {
        /**
         * Retrieves the list of users you can currently access, or are already familiar with.
         *
         * @returns - The list of IUser objects.
         */
        familiars: this.getFamiliars.bind(this),
        /**
         * Retrieves a user's information by a string identifier.
         * @param identifier: A userID, hex string public key, or a username.
         *
         * @returns - The user's IUser object, or null if the user does not exist.
         */
        retrieve: this.retrieveUserDBEntry.bind(this),
    };

    private readonly adapters: IClientAdapters;

    private readonly ax: AxiosInstance;

    private conn: IWebSocketLike;
    private readonly database: IStorage;

    private readonly dbPath: string;

    private device?: IDevice;
    private deviceRecords: Record<string, IDevice> = {};
    private fetchingMail: boolean = false;
    private firstMailFetch = true;
    private readonly forwarded: string[] = [];

    private readonly host: string;

    private readonly idKeys: nacl.BoxKeyPair | null;
    private isAlive: boolean = true;

    private readonly log: ILogger;

    private readonly mailInterval?: NodeJS.Timeout;
    private manuallyClosing: boolean = false;

    private readonly options?: IClientOptions;
    private pingInterval: null | ReturnType<typeof setTimeout> = null;
    private readonly prefixes:
        | { HTTP: "http://"; WS: "ws://" }
        | { HTTP: "https://"; WS: "wss://" };

    private reading: boolean = false;
    private sessionRecords: Record<string, ISessionCrypto> = {};
    // these are created from one set of sign keys
    private readonly signKeys: nacl.SignKeyPair;

    private token: null | string = null;

    private user?: IUser;

    private userRecords: Record<string, IUser> = {};
    private xKeyRing?: IXKeyRing;

    private constructor(
        privateKey?: string,
        options?: IClientOptions,
        storage?: IStorage,
    ) {
        super();
        this.options = options;

        this.log = options?.adapters?.logger ?? {
            debug() {},
            error() {},
            info() {},
            warn() {},
        };

        this.prefixes = options?.unsafeHttp
            ? { HTTP: "http://", WS: "ws://" }
            : { HTTP: "https://", WS: "wss://" };

        this.signKeys = privateKey
            ? nacl.sign.keyPair.fromSecretKey(XUtils.decodeHex(privateKey))
            : nacl.sign.keyPair();
        this.idKeys = XKeyConvert.convertKeyPair(this.signKeys);

        if (!this.idKeys) {
            throw new Error("Could not convert key to X25519!");
        }

        this.host = options?.host || "api.vex.wtf";
        const dbFileName = options?.inMemoryDb
            ? ":memory:"
            : XUtils.encodeHex(this.signKeys.publicKey) + ".sqlite";
        this.dbPath = options?.dbFolder
            ? options?.dbFolder + "/" + dbFileName
            : dbFileName;

        if (!storage) {
            throw new Error(
                "No storage provided. Use Client.create() which resolves storage automatically.",
            );
        }
        this.database = storage;

        this.database.on("error", (error) => {
            this.log.error(error.toString());
            this.close(true);
        });

        if (!options?.adapters) {
            throw new Error(
                "No adapters provided. Use Client.create() which resolves adapters automatically.",
            );
        }
        this.adapters = options.adapters;

        this.ax = axios.create({ responseType: "arraybuffer" });

        // Placeholder connection — replaced by initSocket() during connect()
        this.conn = new this.adapters.WebSocket("ws://localhost:1234");
        this.conn.onerror = () => {};

        this.log.info(
            "Client debug information: " +
                JSON.stringify(
                    {
                        dbPath: this.dbPath,
                        environment: {
                            platform: this.options?.deviceName ?? "unknown",
                        },
                        host: this.getHost(),
                        options,
                        publicKey: this.getKeys().public,
                    },
                    null,
                    4,
                ),
        );
    }

    /**
     * Creates and initializes a client in one step.
     *
     * @param privateKey Optional hex secret key. When omitted, a fresh key is generated.
     * @param options Runtime options.
     * @param storage Optional custom storage backend implementing `IStorage`.
     *
     * @example
     * ```ts
     * const client = await Client.create(privateKey, { host: "api.vex.wtf" });
     * ```
     */
    public static create = async (
        privateKey?: string,
        options?: IClientOptions,
        storage?: IStorage,
    ): Promise<Client> => {
        let opts = options;
        if (!opts?.adapters) {
            const { default: WebSocket } = await import("ws");
            const { createLogger: makeLog } =
                await import("./utils/createLogger.js");
            opts = {
                ...opts,
                adapters: {
                    logger: makeLog("libvex", opts?.logLevel),
                    WebSocket: WebSocket as any,
                },
            };
        }
        // Lazily create Node Storage only on the Node path (no adapters).
        // When adapters are provided (browser/RN), the caller must supply storage
        // via PlatformPreset.createStorage() — there is no Node fallback.
        let resolvedStorage = storage;
        if (!resolvedStorage) {
            if (opts?.adapters) {
                throw new Error(
                    "No storage provided. When using adapters (browser/RN), pass storage from your PlatformPreset.",
                );
            }
            const { createNodeStorage } = await import("./storage/node.js");
            const dbFileName = opts?.inMemoryDb
                ? ":memory:"
                : XUtils.encodeHex(
                      nacl.sign.keyPair.fromSecretKey(
                          XUtils.decodeHex(privateKey || ""),
                      ).publicKey,
                  ) + ".sqlite";
            const dbPath = opts?.dbFolder
                ? opts.dbFolder + "/" + dbFileName
                : dbFileName;
            resolvedStorage = createNodeStorage(
                dbPath,
                privateKey || XUtils.encodeHex(nacl.sign.keyPair().secretKey),
            );
        }
        const client = new Client(privateKey, opts, resolvedStorage);
        await client.init();
        return client;
    };

    /**
     * Generates an ed25519 secret key as a hex string.
     *
     * @returns - A secret key to use for the client. Save it permanently somewhere safe.
     */
    public static generateSecretKey(): string {
        return XUtils.encodeHex(nacl.sign.keyPair().secretKey);
    }

    /**
     * Generates a random username using bip39.
     *
     * @returns - The username.
     */
    public static randomUsername() {
        const IKM = XUtils.decodeHex(XUtils.encodeHex(nacl.randomBytes(16)));
        const mnemonic = xMnemonic(IKM).split(" ");
        const addendum = XUtils.uint8ArrToNumber(nacl.randomBytes(1));

        return (
            capitalize(mnemonic[0]) +
            capitalize(mnemonic[1]) +
            addendum.toString()
        );
    }

    private static deserializeExtra(
        type: MailType,
        extra: Uint8Array,
    ): Uint8Array[] {
        switch (type) {
            case MailType.initial:
                /* 32 bytes for signkey, 32 bytes for ephemeral key, 
                 68 bytes for AD, 6 bytes for otk index (empty for no otk) */
                const signKey = extra.slice(0, 32);
                const ephKey = extra.slice(32, 64);
                const ad = extra.slice(96, 164);
                const index = extra.slice(164, 170);
                return [signKey, ephKey, ad, index];
            case MailType.subsequent:
                const publicKey = extra;
                return [publicKey];
            default:
                return [];
        }
    }

    private static getMnemonic(session: ISessionSQL): string {
        return xMnemonic(xKDF(XUtils.decodeHex(session.fingerprint)));
    }

    /**
     * Manually closes the client. Emits the closed event on successful shutdown.
     */
    public async close(muteEvent = false): Promise<void> {
        this.manuallyClosing = true;
        this.log.info("Manually closing client.");

        this.conn.close();
        await this.database.close();

        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }

        if (this.mailInterval) {
            clearInterval(this.mailInterval);
        }
        delete this.xKeyRing;

        if (!muteEvent) {
            this.emit("closed");
        }
        return;
    }

    /**
     * Connects your device to the chat. You must have a valid Bearer token.
     * You can check whoami() to see before calling connect().
     */
    public async connect(): Promise<void> {
        const { token, user } = await this.whoami();
        this.token = token;
        this.ax.defaults.headers.common.Authorization = `Bearer ${token}`;

        if (!user || !token) {
            throw new Error("Auth token missing or expired. Log in again.");
        }
        this.setUser(user);

        this.device = await this.retrieveOrCreateDevice();

        const connectToken = await this.getToken("connect");
        if (!connectToken) {
            throw new Error("Couldn't get connect token.");
        }
        const signed = nacl.sign(
            Uint8Array.from(uuid.parse(connectToken.key)),
            this.signKeys.secretKey,
        );

        const res = await this.ax.post(
            this.getHost() + "/device/" + this.device.deviceID + "/connect",
            msgpack.encode({ signed }),
            { headers: { "Content-Type": "application/msgpack" } },
        );
        const { deviceToken } = msgpack.decode(new Uint8Array(res.data));
        this.ax.defaults.headers.common["X-Device-Token"] = deviceToken;

        this.log.info("Starting websocket.");
        this.initSocket();
        // Yield the event loop so the WS open callback fires and sends the
        // auth message before OTK generation blocks for ~5s on mobile.
        await new Promise((r) => setTimeout(r, 0));
        await this.negotiateOTK();
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
    public getKeys(): IKeys {
        return {
            private: XUtils.encodeHex(this.signKeys.secretKey),
            public: XUtils.encodeHex(this.signKeys.publicKey),
        };
    }

    /**
     * Authenticates with username/password and stores the Bearer auth token.
     *
     * @param username Account username.
     * @param password Account password.
     * @returns `null` on success, or the thrown error object on failure.
     *
     * @example
     * ```ts
     * const err = await client.login("alice", "correct horse battery staple");
     * if (err) console.error(err);
     * ```
     */
    public async login(
        username: string,
        password: string,
    ): Promise<Error | null> {
        try {
            const res = await this.ax.post(
                this.getHost() + "/auth",
                msgpack.encode({
                    password,
                    username,
                }),
                {
                    headers: { "Content-Type": "application/msgpack" },
                },
            );
            const { token, user }: { token: string; user: IUser; } =
                msgpack.decode(new Uint8Array(res.data));

            this.setUser(user);
            this.token = token;
            this.ax.defaults.headers.common.Authorization = `Bearer ${token}`;
        } catch (err) {
            console.error(err.toString());
            return err;
        }
        return null;
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

            const challengeRes = await this.ax.post(
                this.getHost() + "/auth/device",
                msgpack.encode({
                    deviceID: id,
                    signKey: signKeyHex,
                }),
                { headers: { "Content-Type": "application/msgpack" } },
            );
            const { challenge, challengeID } = msgpack.decode(
                new Uint8Array(challengeRes.data),
            );

            const signed = XUtils.encodeHex(
                nacl.sign(XUtils.decodeHex(challenge), this.signKeys.secretKey),
            );

            const verifyRes = await this.ax.post(
                this.getHost() + "/auth/device/verify",
                msgpack.encode({ challengeID, signed }),
                { headers: { "Content-Type": "application/msgpack" } },
            );
            const { token, user }: { token: string; user: IUser; } =
                msgpack.decode(new Uint8Array(verifyRes.data));

            this.setUser(user);
            this.token = token;
            this.ax.defaults.headers.common.Authorization = `Bearer ${token}`;
        } catch (err) {
            this.log.error("Device-key auth failed: " + err);
            return err instanceof Error ? err : new Error(String(err));
        }
        return null;
    }

    /**
     * Logs out the current authenticated session from the server.
     */
    public async logout(): Promise<void> {
        await this.ax.post(this.getHost() + "/goodbye");
    }

    /**
     * Registers a new account on the server.
     * @param username The username to register. Must be unique.
     *
     * @returns The error, or the user object.
     *
     * @example [user, err] = await client.register("MyUsername");
     */
    public async register(
        username: string,
        password: string,
    ): Promise<[IUser | null, Error | null]> {
        while (!this.xKeyRing) {
            await sleep(100);
        }
        const regKey = await this.getToken("register");
        if (regKey) {
            const signKey = XUtils.encodeHex(this.signKeys.publicKey);
            const signed = XUtils.encodeHex(
                nacl.sign(
                    Uint8Array.from(uuid.parse(regKey.key)),
                    this.signKeys.secretKey,
                ),
            );
            const regMsg: IRegistrationPayload = {
                deviceName: this.options?.deviceName ?? "unknown",
                password,
                preKey: XUtils.encodeHex(
                    this.xKeyRing.preKeys.keyPair.publicKey,
                ),
                preKeyIndex: this.xKeyRing.preKeys.index!,
                preKeySignature: XUtils.encodeHex(
                    this.xKeyRing.preKeys.signature,
                ),
                signed,
                signKey,
                username,
            };
            try {
                const res = await this.ax.post(
                    this.getHost() + "/register",
                    msgpack.encode(regMsg),
                    { headers: { "Content-Type": "application/msgpack" } },
                );
                this.setUser(msgpack.decode(new Uint8Array(res.data)));
                return [this.getUser(), null];
            } catch (err) {
                if (err.response) {
                    return [null, new Error(err.response.data.error)];
                } else {
                    return [null, err];
                }
            }
        } else {
            return [null, new Error("Couldn't get regkey from server.")];
        }
    }

    /**
     * Returns a compact `<username><deviceID>` debug label.
     */
    public override toString(): string {
        return this.user?.username + "<" + this.device?.deviceID + ">";
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
        token: string;
        user: IUser;
    }> {
        const res = await this.ax.post(this.getHost() + "/whoami");

        const whoami: {
            exp: number;
            token: string;
            user: IUser;
        } = msgpack.decode(new Uint8Array(res.data));
        return whoami;
    }

    private censorPreKey(preKey: IPreKeysSQL): IPreKeysWS {
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
    ): Promise<IChannel> {
        const body = { name };
        const res = await this.ax.post(
            this.getHost() + "/server/" + serverID + "/channels",
            msgpack.encode(body),
            { headers: { "Content-Type": "application/msgpack" } },
        );
        return msgpack.decode(new Uint8Array(res.data));
    }

    // returns the file details and the encryption key
    private async createFile(file: Uint8Array): Promise<[IFileSQL, string]> {
        this.log.info("Creating file, size: " + formatBytes(file.byteLength));

        const nonce = xMakeNonce();
        const key = nacl.box.keyPair();
        const box = nacl.secretbox(Uint8Array.from(file), nonce, key.secretKey);

        this.log.info("Encrypted size: " + formatBytes(box.byteLength));

        if (typeof FormData !== "undefined") {
            const fpayload = new FormData();
            fpayload.set("owner", this.getDevice().deviceID);
            fpayload.set("nonce", XUtils.encodeHex(nonce));
            fpayload.set("file", new Blob([new Uint8Array(box)]));

            const fres = await this.ax.post(
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
                        const progress: IFileProgress = {
                            direction: "upload",
                            loaded,
                            progress: percentCompleted,
                            token: XUtils.encodeHex(nonce),
                            total,
                        };
                        this.emit("fileProgress", progress);
                    },
                },
            );
            const fcreatedFile: IFileSQL = msgpack.decode(
                new Uint8Array(fres.data),
            );

            return [fcreatedFile, XUtils.encodeHex(key.secretKey)];
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
        const res = await this.ax.post(
            this.getHost() + "/file/json",
            msgpack.encode(payload),
            { headers: { "Content-Type": "application/msgpack" } },
        );
        const createdFile: IFileSQL = msgpack.decode(new Uint8Array(res.data));

        return [createdFile, XUtils.encodeHex(key.secretKey)];
    }

    private async createInvite(serverID: string, duration: string) {
        const payload = {
            duration,
            serverID,
        };

        const res = await this.ax.post(
            this.getHost() + "/server/" + serverID + "/invites",
            payload,
        );

        return msgpack.decode(new Uint8Array(res.data));
    }

    private createPreKey() {
        const preKeyPair = nacl.box.keyPair();
        const preKeys: IPreKeysCrypto = {
            keyPair: preKeyPair,
            signature: nacl.sign(
                xEncode(xConstants.CURVE, preKeyPair.publicKey),
                this.signKeys.secretKey,
            ),
        };
        return preKeys;
    }

    private async createServer(name: string): Promise<IServer> {
        const res = await this.ax.post(
            this.getHost() + "/server/" + globalThis.btoa(name),
        );
        return msgpack.decode(new Uint8Array(res.data));
    }

    private async createSession(
        device: IDevice,
        user: IUser,
        message: Uint8Array,
        group: null | Uint8Array,
        /* this is passed through if the first message is 
        part of a group message */
        mailID: null | string,
        forward: boolean,
    ): Promise<void> {
        let keyBundle: IKeyBundle;

        this.log.info(
            "Requesting key bundle for device: " +
                JSON.stringify(device, null, 4),
        );
        try {
            keyBundle = await this.retrieveKeyBundle(device.deviceID);
        } catch (err) {
            this.log.warn("Couldn't get key bundle:", err);
            return;
        }

        this.log.warn(
            this.toString() +
                " retrieved keybundle #" +
                keyBundle.otk?.index.toString() +
                " for " +
                device.deviceID,
        );

        // my keys
        const IK_A = this.xKeyRing!.identityKeys.secretKey;
        const IK_AP = this.xKeyRing!.identityKeys.publicKey;
        const EK_A = this.xKeyRing!.ephemeralKeys.secretKey;

        // their keys
        const IK_B = XKeyConvert.convertPublicKey(keyBundle.signKey)!;
        const SPK_B = keyBundle.preKey.publicKey;
        const OPK_B = keyBundle.otk ? keyBundle.otk.publicKey : null;

        // diffie hellman functions
        const DH1 = xDH(IK_A, SPK_B);
        const DH2 = xDH(EK_A, IK_B);
        const DH3 = xDH(EK_A, SPK_B);
        const DH4 = OPK_B ? xDH(EK_A, OPK_B) : null;

        // initial key material
        const IKM = DH4 ? xConcat(DH1, DH2, DH3, DH4) : xConcat(DH1, DH2, DH3);

        // one time key index
        const IDX = keyBundle.otk
            ? XUtils.numberToUint8Arr(keyBundle.otk.index)
            : XUtils.numberToUint8Arr(0);

        // shared secret key
        const SK = xKDF(IKM);
        this.log.info("Obtained SK, " + XUtils.encodeHex(SK));

        const PK = nacl.box.keyPair.fromSecretKey(SK).publicKey;
        this.log.info(
            this.toString() +
                " Obtained PK for " +
                device.deviceID +
                " " +
                XUtils.encodeHex(PK),
        );

        const AD = xConcat(
            xEncode(xConstants.CURVE, IK_AP),
            xEncode(xConstants.CURVE, IK_B),
        );

        const nonce = xMakeNonce();
        const cipher = nacl.secretbox(message, nonce, SK);

        this.log.info("Encrypted ciphertext.");

        /* 32 bytes for signkey, 32 bytes for ephemeral key, 
        68 bytes for AD, 6 bytes for otk index (empty for no otk) */
        const extra = xConcat(
            this.signKeys.publicKey,
            this.xKeyRing!.ephemeralKeys.publicKey,
            PK,
            AD,
            IDX,
        );

        const mail: IMailWS = {
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
        this.log.info("Mail hash: " + objectHash(mail));
        this.log.info("Generated hmac: " + XUtils.encodeHex(hmac));

        const msg: IResourceMsg = {
            action: "CREATE",
            data: mail,
            resourceType: "mail",
            transmissionID: uuid.v4(),
            type: "resource",
        };

        // discard the ephemeral keys
        this.newEphemeralKeys();

        // save the encryption session
        this.log.info("Saving new session.");
        const sessionEntry: ISessionSQL = {
            deviceID: device.deviceID,
            fingerprint: XUtils.encodeHex(AD),
            lastUsed: new Date(Date.now()),
            mode: "initiator",
            publicKey: XUtils.encodeHex(PK),
            sessionID: uuid.v4(),
            SK: XUtils.encodeHex(SK),
            userID: user.userID,
            verified: false,
        };

        await this.database.saveSession(sessionEntry);

        this.emit("session", sessionEntry, user);

        // emit the message
        const emitMsg: IMessage = forward
            ? { ...msgpack.decode(message), forward: true }
            : {
                  authorID: mail.authorID,
                  decrypted: true,
                  direction: "outgoing",
                  forward: mail.forward,
                  group: mail.group ? uuid.stringify(mail.group) : null,
                  mailID: mail.mailID,
                  message: XUtils.encodeUTF8(message),
                  nonce: XUtils.encodeHex(mail.nonce),
                  readerID: mail.readerID,
                  recipient: mail.recipient,
                  sender: mail.sender,
                  timestamp: new Date(Date.now()),
              };
        this.emit("message", emitMsg);

        // send mail and wait for response
        await new Promise((res, rej) => {
            const callback = (packedMsg: Uint8Array) => {
                const [header, receivedMsg] = XUtils.unpackMessage(packedMsg);
                if (receivedMsg.transmissionID === msg.transmissionID) {
                    this.conn.off("message", callback);
                    if (receivedMsg.type === "success") {
                        res((receivedMsg as ISuccessMsg).data);
                    } else {
                        rej({
                            error: receivedMsg,
                            message: emitMsg,
                        });
                    }
                }
            };
            this.conn.on("message", callback);
            this.send(msg, hmac);
            this.log.info("Mail sent.");
        });
        delete this.sending[device.deviceID];
    }

    private async deleteChannel(channelID: string): Promise<void> {
        await this.ax.delete(this.getHost() + "/channel/" + channelID);
    }

    private async deleteDevice(deviceID: string): Promise<void> {
        if (deviceID === this.getDevice().deviceID) {
            throw new Error("You can't delete the device you're logged in to.");
        }
        await this.ax.delete(
            this.prefixes.HTTP +
                this.host +
                "/user/" +
                this.getUser().userID +
                "/devices/" +
                deviceID,
        );
    }

    private async deleteHistory(
        channelOrUserID: string,
        olderThan?: string,
    ): Promise<void> {
        await this.database.deleteHistory(channelOrUserID, olderThan);
    }

    private async deletePermission(permissionID: string): Promise<void> {
        await this.ax.delete(this.getHost() + "/permission/" + permissionID);
    }

    private async deleteServer(serverID: string): Promise<void> {
        await this.ax.delete(this.getHost() + "/server/" + serverID);
    }

    /**
     * Gets a list of permissions for a server.
     *
     * @returns - The list of IPermissions objects.
     */
    private async fetchPermissionList(
        serverID: string,
    ): Promise<IPermission[]> {
        const res = await this.ax.get(
            this.prefixes.HTTP +
                this.host +
                "/server/" +
                serverID +
                "/permissions",
        );
        return msgpack.decode(new Uint8Array(res.data));
    }

    private async forward(message: IMessage) {
        const copy = { ...message };

        if (this.forwarded.includes(copy.mailID)) {
            return;
        }
        this.forwarded.push(copy.mailID);
        if (this.forwarded.length > 1000) {
            this.forwarded.shift();
        }

        const msgBytes = Uint8Array.from(msgpack.encode(copy));

        const devices = await this.getUserDeviceList(this.getUser().userID);
        this.log.info(
            "Forwarding to my other devices, deviceList length is " +
                devices?.length,
        );

        if (!devices) {
            throw new Error("Couldn't get own devices.");
        }
        const promises = [];
        for (const device of devices) {
            if (device.deviceID !== this.getDevice().deviceID) {
                promises.push(
                    this.sendMail(
                        device,
                        this.getUser(),
                        msgBytes,
                        null,
                        copy.mailID,
                        true,
                    ),
                );
            }
        }
        Promise.allSettled(promises).then((results) => {
            for (const result of results) {
                const { status } = result;
                if (status === "rejected") {
                    this.log.warn("Message failed.");
                    this.log.warn(JSON.stringify(result));
                }
            }
        });
    }

    private async getChannelByID(channelID: string): Promise<IChannel | null> {
        try {
            const res = await this.ax.get(
                this.getHost() + "/channel/" + channelID,
            );
            return msgpack.decode(new Uint8Array(res.data));
        } catch (err) {
            return null;
        }
    }

    private async getChannelList(serverID: string): Promise<IChannel[]> {
        const res = await this.ax.get(
            this.getHost() + "/server/" + serverID + "/channels",
        );
        return msgpack.decode(new Uint8Array(res.data));
    }

    private getDevice(): IDevice {
        if (!this.device) {
            throw new Error(
                "You must wait until the auth event is emitted before fetching device details.",
            );
        }
        return this.device;
    }

    private async getDeviceByID(deviceID: string): Promise<IDevice | null> {
        if (this.deviceRecords[deviceID]) {
            this.log.info("Found device in local cache.");
            return this.deviceRecords[deviceID];
        }

        const device = await this.database.getDevice(deviceID);
        if (device) {
            this.log.info("Found device in local db.");
            this.deviceRecords[deviceID] = device;
            return device;
        }
        try {
            const res = await this.ax.get(
                this.getHost() + "/device/" + deviceID,
            );
            this.log.info("Retrieved device from server.");
            const fetchedDevice = msgpack.decode(new Uint8Array(res.data));
            this.deviceRecords[deviceID] = fetchedDevice;
            await this.database.saveDevice(fetchedDevice);
            return fetchedDevice;
        } catch (err) {
            return null;
        }
    }

    /* Retrieves the current list of users you have sessions with. */
    private async getFamiliars(): Promise<IUser[]> {
        const sessions = await this.database.getAllSessions();
        const familiars: IUser[] = [];

        for (const session of sessions) {
            const [user, err] = await this.retrieveUserDBEntry(session.userID);
            if (user) {
                familiars.push(user);
            }
        }

        return familiars;
    }

    private async getGroupHistory(channelID: string): Promise<IMessage[]> {
        const messages: IMessage[] =
            await this.database.getGroupHistory(channelID);

        return messages;
    }

    private async getMail(): Promise<void> {
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
            this.emit("decryptingMail");
        }

        this.log.info("fetching mail for device " + this.getDevice().deviceID);
        try {
            const res = await this.ax.post(
                this.getHost() +
                    "/device/" +
                    this.getDevice().deviceID +
                    "/mail",
            );
            const inbox: Array<[Uint8Array, IMailWS, Date]> = msgpack
                .decode(new Uint8Array(res.data))
                .sort(
                    (
                        a: [Uint8Array, IMailWS, Date],
                        b: [Uint8Array, IMailWS, Date],
                    ) => b[2].getTime() - a[2].getTime(),
                );

            for (const mailDetails of inbox) {
                const [mailHeader, mailBody, timestamp] = mailDetails;
                try {
                    await this.readMail(
                        mailHeader,
                        mailBody,
                        timestamp.toString(),
                    );
                } catch (err) {
                    console.warn(err.toString());
                }
            }
        } catch (err) {
            console.warn(err.toString());
        }
        this.fetchingMail = false;
    }

    private async getMessageHistory(userID: string): Promise<IMessage[]> {
        const messages: IMessage[] =
            await this.database.getMessageHistory(userID);

        return messages;
    }

    private async getMultiUserDeviceList(
        userIDs: string[],
    ): Promise<IDevice[]> {
        try {
            const res = await this.ax.post(
                this.getHost() + "/deviceList",
                msgpack.encode(userIDs),
                { headers: { "Content-Type": "application/msgpack" } },
            );
            const devices: IDevice[] = msgpack.decode(new Uint8Array(res.data));
            for (const device of devices) {
                this.deviceRecords[device.deviceID] = device;
            }

            return devices;
        } catch (err) {
            return [];
        }
    }

    private async getOTKCount(): Promise<number> {
        const res = await this.ax.get(
            this.getHost() +
                "/device/" +
                this.getDevice().deviceID +
                "/otk/count",
        );
        return msgpack.decode(new Uint8Array(res.data)).count;
    }

    /**
     * Gets all permissions for the logged in user.
     *
     * @returns - The list of IPermissions objects.
     */
    private async getPermissions(): Promise<IPermission[]> {
        const res = await this.ax.get(
            this.getHost() + "/user/" + this.getUser().userID + "/permissions",
        );
        return msgpack.decode(new Uint8Array(res.data));
    }

    private async getServerByID(serverID: string): Promise<IServer | null> {
        try {
            const res = await this.ax.get(
                this.getHost() + "/server/" + serverID,
            );
            return msgpack.decode(new Uint8Array(res.data));
        } catch (err) {
            return null;
        }
    }

    private async getServerList(): Promise<IServer[]> {
        const res = await this.ax.get(
            this.getHost() + "/user/" + this.getUser().userID + "/servers",
        );
        return msgpack.decode(new Uint8Array(res.data));
    }

    private async getSessionByPubkey(publicKey: Uint8Array) {
        const strPubKey = XUtils.encodeHex(publicKey);
        if (this.sessionRecords[strPubKey]) {
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
    ): Promise<IActionToken | null> {
        try {
            const res = await this.ax.get(this.getHost() + "/token/" + type, {
                responseType: "arraybuffer",
            });
            return msgpack.decode(new Uint8Array(res.data));
        } catch (err) {
            this.log.warn(err.toString());
            return null;
        }
    }

    /* Get the currently logged in user. You cannot call this until 
    after the auth event is emitted. */
    private getUser(): IUser {
        if (!this.user) {
            throw new Error(
                "You must wait until the auth event is emitted before fetching user details.",
            );
        }
        return this.user;
    }

    private async getUserDeviceList(userID: string): Promise<IDevice[] | null> {
        try {
            const res = await this.ax.get(
                this.getHost() + "/user/" + userID + "/devices",
            );
            const devices: IDevice[] = msgpack.decode(new Uint8Array(res.data));
            for (const device of devices) {
                this.deviceRecords[device.deviceID] = device;
            }

            return devices;
        } catch (err) {
            return null;
        }
    }

    private async getUserList(channelID: string): Promise<IUser[]> {
        const res = await this.ax.post(
            this.getHost() + "/userList/" + channelID,
        );
        return msgpack.decode(new Uint8Array(res.data));
    }

    private async handleNotify(msg: INotifyMsg) {
        switch (msg.event) {
            case "mail":
                this.log.info("Server has informed us of new mail.");
                await this.getMail();
                this.fetchingMail = false;
                break;
            case "permission":
                this.emit("permission", msg.data as IPermission);
                break;
            case "retryRequest":
                const messageID = msg.data;

                break;
            default:
                this.log.info("Unsupported notification event " + msg.event);
                break;
        }
    }

    /**
     * Initializes the keyring. This must be called before anything else.
     */
    private async init(): Promise<void> {
        if (this.hasInit) {
            throw new Error("You should only call init() once.");
        }
        this.hasInit = true;

        await this.populateKeyRing();
        this.on("message", async (message) => {
            if (message.direction === "outgoing" && !message.forward) {
                this.forward(message);
            }

            if (
                message.direction === "incoming" &&
                message.recipient === message.sender
            ) {
                return;
            }
            await this.database.saveMessage(message);
        });
        this.emit("ready");
    }

    private initSocket() {
        try {
            if (!this.token) {
                throw new Error("No token found, did you call login()?");
            }

            const wsUrl = this.prefixes.WS + this.host + "/socket";
            // Auth sent as first message after open
            this.conn = new this.adapters.WebSocket(wsUrl);
            this.conn.on("open", () => {
                this.log.info("Connection opened.");
                // Send auth as first message before anything else.
                this.conn.send(
                    JSON.stringify({ token: this.token, type: "auth" }),
                );
                this.pingInterval = setInterval(this.ping.bind(this), 15000);
            });

            this.conn.on("close", () => {
                this.log.info("Connection closed.");
                if (this.pingInterval) {
                    clearInterval(this.pingInterval);
                    this.pingInterval = null;
                }
                if (!this.manuallyClosing) {
                    this.emit("disconnect");
                }
            });

            this.conn.on("error", (error) => {
                throw error;
            });

            this.conn.on("message", async (message: Uint8Array) => {
                const [header, msg] = XUtils.unpackMessage(message);

                this.log.debug(
                    pc.red(pc.bold("INH ") + XUtils.encodeHex(header)),
                );
                this.log.debug(
                    pc.red(pc.bold("IN ") + JSON.stringify(msg, null, 4)),
                );

                switch (msg.type) {
                    case "challenge":
                        this.log.info("Received challenge from server.");
                        this.respond(msg as IChallMsg);
                        break;
                    case "error":
                        this.log.warn(JSON.stringify(msg));
                        break;
                    case "notify":
                        this.handleNotify(msg as INotifyMsg);
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
                        this.log.info(
                            "Authenticated with userID " + this.user!.userID,
                        );
                        this.emit("connected");
                        this.postAuth();
                        break;
                    default:
                        this.log.info("Unsupported message " + msg.type);
                        break;
                }
            });
        } catch (err) {
            throw new Error(
                "Error initiating websocket connection " + err.toString(),
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
        this.log.info("Server reported OTK: " + otkCount.toString());
        const needs = xConstants.MIN_OTK_SUPPLY - otkCount;
        if (needs === 0) {
            this.log.info("Server otk supply full.");
            return;
        }

        await this.submitOTK(needs);
    }

    private newEphemeralKeys() {
        this.xKeyRing!.ephemeralKeys = nacl.box.keyPair();
    }

    private async ping() {
        if (!this.isAlive) {
            this.log.warn("Ping failed.");
        }
        this.setAlive(false);
        this.send({ transmissionID: uuid.v4(), type: "ping" });
    }

    private pong(transmissionID: string) {
        this.send({ transmissionID, type: "pong" });
    }

    private async populateKeyRing() {
        // we've checked in the constructor that these exist
        const identityKeys = this.idKeys!;

        let preKeys = await this.database.getPreKeys();
        if (!preKeys) {
            this.log.warn("No prekeys found in database, creating a new one.");
            preKeys = this.createPreKey();
            await this.database.savePreKeys([preKeys], false);
        }

        const sessions = await this.database.getAllSessions();
        for (const session of sessions) {
            this.sessionRecords[session.publicKey] =
                sqlSessionToCrypto(session);
        }

        const ephemeralKeys = nacl.box.keyPair();

        this.xKeyRing = {
            ephemeralKeys,
            identityKeys,
            preKeys,
        };

        this.log.info(
            "Keyring populated:\n" +
                JSON.stringify(
                    {
                        ephemeralKey: XUtils.encodeHex(ephemeralKeys.publicKey),
                        preKey: XUtils.encodeHex(preKeys.keyPair.publicKey),
                        signKey: XUtils.encodeHex(this.signKeys.publicKey),
                    },
                    null,
                    4,
                ),
        );
    }

    private async postAuth() {
        let count = 0;
        while (true) {
            try {
                await this.getMail();
                count++;
                this.fetchingMail = false;

                if (count > 10) {
                    this.negotiateOTK();
                    count = 0;
                }
            } catch (err) {
                this.log.warn("Problem fetching mail" + err.toString());
            }
            await sleep(1000 * 60);
        }
    }

    private async purgeHistory(): Promise<void> {
        await this.database.purgeHistory();
    }

    private async readMail(
        header: Uint8Array,
        mail: IMailWS,
        timestamp: string,
    ) {
        this.sendReceipt(mail.nonce);
        let timeout = 1;
        while (this.reading) {
            await sleep(timeout);
            timeout *= 2;
        }
        this.reading = true;

        try {
            const healSession = async () => {
                this.log.info("Requesting retry of " + mail.mailID);
                const deviceEntry = await this.getDeviceByID(mail.sender);
                const [user, err] = await this.retrieveUserDBEntry(
                    mail.authorID,
                );
                if (deviceEntry && user) {
                    this.createSession(
                        deviceEntry,
                        user,
                        XUtils.decodeUTF8(`��RETRY_REQUEST:${mail.mailID}��`),
                        mail.group,
                        uuid.v4(),
                        false,
                    );
                }
            };

            this.log.info("Received mail from " + mail.sender);
            switch (mail.mailType) {
                case MailType.initial:
                    this.log.info("Initiating new session.");
                    const [signKey, ephKey, assocData, indexBytes] =
                        Client.deserializeExtra(MailType.initial, mail.extra);

                    const preKeyIndex = XUtils.uint8ArrToNumber(indexBytes);

                    this.log.info(
                        this.toString() + " otk #" + preKeyIndex + " indicated",
                    );

                    const otk =
                        preKeyIndex === 0
                            ? null
                            : await this.database.getOneTimeKey(preKeyIndex);

                    if (otk) {
                        this.log.info(
                            "otk #" +
                                JSON.stringify(otk?.index) +
                                " retrieved from database.",
                        );
                    }

                    this.log.info("signKey: " + XUtils.encodeHex(signKey));
                    this.log.info("preKey: " + XUtils.encodeHex(ephKey));
                    if (otk) {
                        this.log.info(
                            "OTK: " + XUtils.encodeHex(otk.keyPair.publicKey),
                        );
                    }

                    if (otk?.index !== preKeyIndex && preKeyIndex !== 0) {
                        this.log.warn(
                            "OTK index mismatch, received " +
                                JSON.stringify(otk?.index) +
                                ", expected " +
                                preKeyIndex.toString(),
                        );
                        return;
                    }

                    // their public keys
                    const IK_A = XKeyConvert.convertPublicKey(signKey)!;
                    const EK_A = ephKey;

                    // my private keys
                    const IK_B = this.xKeyRing!.identityKeys.secretKey;
                    const IK_BP = this.xKeyRing!.identityKeys.publicKey;
                    const SPK_B = this.xKeyRing!.preKeys.keyPair.secretKey;
                    const OPK_B = otk ? otk.keyPair.secretKey : null;

                    // diffie hellman functions
                    const DH1 = xDH(SPK_B, IK_A);
                    const DH2 = xDH(IK_B, EK_A);
                    const DH3 = xDH(SPK_B, EK_A);
                    const DH4 = OPK_B ? xDH(OPK_B, EK_A) : null;

                    // initial key material
                    const IKM = DH4
                        ? xConcat(DH1, DH2, DH3, DH4)
                        : xConcat(DH1, DH2, DH3);

                    // shared secret key
                    const SK = xKDF(IKM);
                    this.log.info(
                        "Obtained SK for " +
                            mail.sender +
                            ", " +
                            XUtils.encodeHex(SK),
                    );

                    // shared public key
                    const PK = nacl.box.keyPair.fromSecretKey(SK).publicKey;
                    this.log.info(
                        this.toString() +
                            "Obtained PK for " +
                            mail.sender +
                            " " +
                            XUtils.encodeHex(PK),
                    );

                    const hmac = xHMAC(mail, SK);
                    this.log.info("Mail hash: " + objectHash(mail));
                    this.log.info("Calculated hmac: " + XUtils.encodeHex(hmac));

                    // associated data
                    const AD = xConcat(
                        xEncode(xConstants.CURVE, IK_A),
                        xEncode(xConstants.CURVE, IK_BP),
                    );

                    if (!XUtils.bytesEqual(hmac, header)) {
                        console.warn(
                            "Mail authentication failed (HMAC did not match).",
                        );
                        console.warn(mail);
                        return;
                    }
                    this.log.info("Mail authenticated successfully.");

                    const unsealed = nacl.secretbox.open(
                        mail.cipher,
                        mail.nonce,
                        SK,
                    );
                    if (unsealed) {
                        this.log.info("Decryption successful.");

                        let plaintext = "";
                        if (!mail.forward) {
                            plaintext = XUtils.encodeUTF8(unsealed);
                        }

                        // emit the message
                        const message: IMessage = mail.forward
                            ? { ...msgpack.decode(unsealed), forward: true }
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
                                  nonce: XUtils.encodeHex(mail.nonce),
                                  readerID: mail.readerID,
                                  recipient: mail.recipient,
                                  sender: mail.sender,
                                  timestamp: new Date(timestamp),
                              };

                        this.emit("message", message);

                        // discard onetimekey
                        await this.database.deleteOneTimeKey(preKeyIndex);

                        const deviceEntry = await this.getDeviceByID(
                            mail.sender,
                        );
                        if (!deviceEntry) {
                            throw new Error("Couldn't get device entry.");
                        }
                        const [userEntry, userErr] =
                            await this.retrieveUserDBEntry(deviceEntry.owner);
                        if (!userEntry) {
                            throw new Error("Couldn't get user entry.");
                        }

                        this.userRecords[userEntry.userID] = userEntry;
                        this.deviceRecords[deviceEntry.deviceID] = deviceEntry;

                        // save session
                        const newSession: ISessionSQL = {
                            deviceID: mail.sender,
                            fingerprint: XUtils.encodeHex(AD),
                            lastUsed: new Date(Date.now()),
                            mode: "receiver",
                            publicKey: XUtils.encodeHex(PK),
                            sessionID: uuid.v4(),
                            SK: XUtils.encodeHex(SK),
                            userID: userEntry.userID,
                            verified: false,
                        };
                        await this.database.saveSession(newSession);

                        let [user, err] = await this.retrieveUserDBEntry(
                            newSession.userID,
                        );

                        if (user) {
                            this.emit("session", newSession, user);
                        } else {
                            let failed = 1;
                            // retry a couple times
                            while (!user) {
                                [user, err] = await this.retrieveUserDBEntry(
                                    newSession.userID,
                                );
                                failed++;
                                if (failed > 3) {
                                    this.log.warn(
                                        "Couldn't retrieve user entry.",
                                    );
                                    break;
                                }
                            }
                        }
                    } else {
                        this.log.warn("Mail decryption failed.");
                    }
                    break;
                case MailType.subsequent:
                    const [publicKey] = Client.deserializeExtra(
                        mail.mailType,
                        mail.extra,
                    );
                    let session = await this.getSessionByPubkey(publicKey);
                    let retries = 0;
                    while (!session) {
                        if (retries > 3) {
                            break;
                        }

                        session = await this.getSessionByPubkey(publicKey);
                        retries++;
                        return;
                    }

                    if (!session) {
                        this.log.warn(
                            "Couldn't find session public key " +
                                XUtils.encodeHex(publicKey),
                        );
                        healSession();
                        return;
                    }
                    this.log.info("Session found for " + mail.sender);
                    this.log.info("Mail nonce " + XUtils.encodeHex(mail.nonce));

                    const HMAC = xHMAC(mail, session.SK);
                    this.log.info("Mail hash: " + objectHash(mail));
                    this.log.info("Calculated hmac: " + XUtils.encodeHex(HMAC));

                    if (!XUtils.bytesEqual(HMAC, header)) {
                        this.log.warn(
                            "Message authentication failed (HMAC does not match).",
                        );
                        healSession();
                        return;
                    }

                    const decrypted = nacl.secretbox.open(
                        mail.cipher,
                        mail.nonce,
                        session.SK,
                    );

                    if (decrypted) {
                        this.log.info("Decryption successful.");
                        let plaintext = "";
                        if (!mail.forward) {
                            plaintext = XUtils.encodeUTF8(decrypted);
                        }
                        // emit the message
                        const message: IMessage = mail.forward
                            ? {
                                  ...msgpack.decode(decrypted),
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
                                  nonce: XUtils.encodeHex(mail.nonce),
                                  readerID: mail.readerID,
                                  recipient: mail.recipient,
                                  sender: mail.sender,
                                  timestamp: new Date(timestamp),
                              };
                        this.emit("message", message);

                        this.database.markSessionUsed(session.sessionID);
                    } else {
                        this.log.info("Decryption failed.");
                        healSession();

                        // emit the message
                        const message: IMessage = {
                            authorID: mail.authorID,
                            decrypted: false,
                            direction: "incoming",
                            forward: mail.forward,
                            group: mail.group
                                ? uuid.stringify(mail.group)
                                : null,
                            mailID: mail.mailID,
                            message: "",
                            nonce: XUtils.encodeHex(mail.nonce),
                            readerID: mail.readerID,
                            recipient: mail.recipient,
                            sender: mail.sender,
                            timestamp: new Date(timestamp),
                        };
                        this.emit("message", message);
                    }
                    break;
                default:
                    this.log.warn("Unsupported MailType:", mail.mailType);
                    break;
            }
        } finally {
            this.reading = false;
        }
    }

    private async redeemInvite(inviteID: string): Promise<IPermission> {
        const res = await this.ax.patch(this.getHost() + "/invite/" + inviteID);
        return msgpack.decode(new Uint8Array(res.data));
    }

    private async registerDevice(): Promise<IDevice | null> {
        while (!this.xKeyRing) {
            await sleep(100);
        }

        const token = await this.getToken("device");

        const [userDetails, err] = await this.retrieveUserDBEntry(
            this.user!.username,
        );
        if (!userDetails) {
            throw new Error("Username not found " + this.user!.username);
        }
        if (err) {
            throw err;
        }
        if (!token) {
            throw new Error("Couldn't fetch token.");
        }

        const signKey = this.getKeys().public;
        const signed = XUtils.encodeHex(
            nacl.sign(
                Uint8Array.from(uuid.parse(token.key)),
                this.signKeys.secretKey,
            ),
        );

        const devMsg: IDevicePayload = {
            deviceName: this.options?.deviceName ?? "unknown",
            preKey: XUtils.encodeHex(this.xKeyRing.preKeys.keyPair.publicKey),
            preKeyIndex: this.xKeyRing.preKeys.index!,
            preKeySignature: XUtils.encodeHex(this.xKeyRing.preKeys.signature),
            signed,
            signKey,
            username: userDetails.username,
        };

        try {
            const res = await this.ax.post(
                this.prefixes.HTTP +
                    this.host +
                    "/user/" +
                    userDetails.userID +
                    "/devices",
                msgpack.encode(devMsg),
                { headers: { "Content-Type": "application/msgpack" } },
            );
            return msgpack.decode(new Uint8Array(res.data));
        } catch (err) {
            throw err;
        }
    }

    private respond(msg: IChallMsg) {
        const response: IRespMsg = {
            signed: nacl.sign(msg.challenge, this.signKeys.secretKey),
            transmissionID: msg.transmissionID,
            type: "response",
        };
        this.send(response);
    }

    private async retrieveEmojiByID(emojiID: string): Promise<IEmoji | null> {
        const res = await this.ax.get(
            this.getHost() + "/emoji/" + emojiID + "/details",
        );
        if (!res.data) {
            return null;
        }
        return msgpack.decode(new Uint8Array(res.data));
    }

    private async retrieveEmojiList(serverID: string): Promise<IEmoji[]> {
        const res = await this.ax.get(
            this.getHost() + "/server/" + serverID + "/emoji",
        );
        return msgpack.decode(new Uint8Array(res.data));
    }

    private async retrieveFile(
        fileID: string,
        key: string,
    ): Promise<IFileResponse | null> {
        try {
            const detailsRes = await this.ax.get(
                this.getHost() + "/file/" + fileID + "/details",
            );
            const details = msgpack.decode(new Uint8Array(detailsRes.data));

            const res = await this.ax.get(this.getHost() + "/file/" + fileID, {
                onDownloadProgress: (progressEvent) => {
                    const percentCompleted = Math.round(
                        (progressEvent.loaded * 100) /
                            (progressEvent.total ?? 1),
                    );
                    const { loaded, total = 0 } = progressEvent;
                    const progress: IFileProgress = {
                        direction: "download",
                        loaded,
                        progress: percentCompleted,
                        token: fileID,
                        total,
                    };
                    this.emit("fileProgress", progress);
                },
            });
            const fileData = res.data;

            const decrypted = nacl.secretbox.open(
                new Uint8Array(fileData),
                XUtils.decodeHex(details.nonce),
                XUtils.decodeHex(key),
            );

            if (decrypted) {
                const resp: IFileResponse = {
                    data: new Uint8Array(decrypted),
                    details,
                };
                return resp;
            }
            throw new Error("Decryption failed.");
        } catch (err) {
            throw err;
        }
    }

    private async retrieveInvites(serverID: string): Promise<IInvite[]> {
        const res = await this.ax.get(
            this.getHost() + "/server/" + serverID + "/invites",
        );
        return msgpack.decode(new Uint8Array(res.data));
    }

    private async retrieveKeyBundle(deviceID: string): Promise<IKeyBundle> {
        const res = await this.ax.post(
            this.getHost() + "/device/" + deviceID + "/keyBundle",
        );
        return msgpack.decode(new Uint8Array(res.data));
    }

    private async retrieveOrCreateDevice(): Promise<IDevice> {
        let device: IDevice;
        try {
            const res = await this.ax.get(
                this.prefixes.HTTP +
                    this.host +
                    "/device/" +
                    XUtils.encodeHex(this.signKeys.publicKey),
            );
            device = msgpack.decode(new Uint8Array(res.data));
        } catch (err) {
            this.log.error(err.toString());
            if (err.response?.status === 404) {
                // just in case
                await this.database.purgeKeyData();
                await this.populateKeyRing();

                this.log.info("Attempting to register device.");

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
        this.log.info("Got device " + JSON.stringify(device, null, 4));
        return device;
    }

    /* Retrieves the userID with the user identifier.
    user identifier is checked for userID, then signkey,
    and finally falls back to username. */
    private async retrieveUserDBEntry(
        userIdentifier: string,
    ): Promise<[IUser | null, AxiosError | null]> {
        if (this.userRecords[userIdentifier]) {
            return [this.userRecords[userIdentifier], null];
        }

        try {
            const res = await this.ax.get(
                this.getHost() + "/user/" + userIdentifier,
            );
            const userRecord = msgpack.decode(new Uint8Array(res.data));
            this.userRecords[userIdentifier] = userRecord;
            return [userRecord, null];
        } catch (err) {
            return [null, err];
        }
    }

    /* header is 32 bytes and is either empty
    or contains an HMAC of the message with
    a derived SK */
    private async send(msg: any, header?: Uint8Array) {
        let i = 0;
        while (this.conn.readyState !== 1) {
            await sleep(i);
            i *= 2;
        }

        this.log.debug(
            pc.red(
                pc.bold("OUTH ") +
                    XUtils.encodeHex(header || XUtils.emptyHeader()),
            ),
        );
        this.log.debug(pc.red(pc.bold("OUT ") + JSON.stringify(msg, null, 4)));

        this.conn.send(XUtils.packMessage(msg, header));
    }

    private async sendGroupMessage(
        channelID: string,
        message: string,
    ): Promise<void> {
        const userList = await this.getUserList(channelID);
        for (const user of userList) {
            this.userRecords[user.userID] = user;
        }

        this.log.info(
            "Sending to userlist:\n" + JSON.stringify(userList, null, 4),
        );

        const mailID = uuid.v4();
        const promises: Array<Promise<void>> = [];

        const userIDs = [...new Set(userList.map((user) => user.userID))];
        const devices = await this.getMultiUserDeviceList(userIDs);

        this.log.info(
            "Retrieved devicelist:\n" + JSON.stringify(devices, null, 4),
        );

        for (const device of devices) {
            promises.push(
                this.sendMail(
                    device,
                    this.userRecords[device.owner],
                    XUtils.decodeUTF8(message),
                    uuidToUint8(channelID),
                    mailID,
                    false,
                ),
            );
        }
        Promise.allSettled(promises).then((results) => {
            for (const result of results) {
                const { status } = result;
                if (status === "rejected") {
                    this.log.warn("Message failed.");
                    this.log.warn(JSON.stringify(result));
                }
            }
        });
    }

    /* Sends encrypted mail to a user. */
    private async sendMail(
        device: IDevice,
        user: IUser,
        msg: Uint8Array,
        group: null | Uint8Array,
        mailID: null | string,
        forward: boolean,
        retry = false,
    ): Promise<void> {
        while (this.sending[device.deviceID] !== undefined) {
            this.log.warn(
                "Sending in progress to device ID " +
                    device.deviceID +
                    ", waiting.",
            );
            await sleep(100);
        }
        this.log.info(
            "Sending mail to user: \n" + JSON.stringify(user, null, 4),
        );
        this.log.info(
            "Sending mail to device:\n " +
                JSON.stringify(device.deviceID, null, 4),
        );
        this.sending[device.deviceID] = device;

        const session = await this.database.getSessionByDeviceID(
            device.deviceID,
        );

        if (!session || retry) {
            this.log.info("Creating new session for " + device.deviceID);
            await this.createSession(device, user, msg, group, mailID, forward);
            return;
        } else {
            this.log.info("Found existing session for " + device.deviceID);
        }

        const nonce = xMakeNonce();
        const cipher = nacl.secretbox(msg, nonce, session.SK);
        const extra = session.publicKey;

        const mail: IMailWS = {
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

        const msgb: IResourceMsg = {
            action: "CREATE",
            data: mail,
            resourceType: "mail",
            transmissionID: uuid.v4(),
            type: "resource",
        };

        const hmac = xHMAC(mail, session.SK);
        this.log.info("Mail hash: " + objectHash(mail));
        this.log.info("Calculated hmac: " + XUtils.encodeHex(hmac));

        const outMsg: IMessage = forward
            ? { ...msgpack.decode(msg), forward: true }
            : {
                  authorID: mail.authorID,
                  decrypted: true,
                  direction: "outgoing",
                  forward: mail.forward,
                  group: mail.group ? uuid.stringify(mail.group) : null,
                  mailID: mail.mailID,
                  message: XUtils.encodeUTF8(msg),
                  nonce: XUtils.encodeHex(mail.nonce),
                  readerID: mail.readerID,
                  recipient: mail.recipient,
                  sender: mail.sender,
                  timestamp: new Date(Date.now()),
              };
        this.emit("message", outMsg);

        await new Promise((res, rej) => {
            const callback = async (packedMsg: Uint8Array) => {
                const [header, receivedMsg] = XUtils.unpackMessage(packedMsg);
                if (receivedMsg.transmissionID === msgb.transmissionID) {
                    this.conn.off("message", callback);
                    if (receivedMsg.type === "success") {
                        res((receivedMsg as ISuccessMsg).data);
                    } else {
                        rej({
                            error: receivedMsg,
                            message: outMsg,
                        });
                    }
                }
            };
            this.conn.on("message", callback);
            this.send(msgb, hmac);
        });
        delete this.sending[device.deviceID];
    }

    private async sendMessage(userID: string, message: string): Promise<void> {
        try {
            const [userEntry, err] = await this.retrieveUserDBEntry(userID);
            if (err) {
                throw err;
            }
            if (!userEntry) {
                throw new Error("Couldn't get user entry.");
            }

            let deviceList = await this.getUserDeviceList(userID);
            if (!deviceList) {
                let retries = 0;
                while (!deviceList) {
                    deviceList = await this.getUserDeviceList(userID);
                    retries++;
                    if (retries > 3) {
                        throw new Error("Couldn't get device list.");
                    }
                }
            }
            const mailID = uuid.v4();
            const promises: Array<Promise<any>> = [];
            for (const device of deviceList) {
                promises.push(
                    this.sendMail(
                        device,
                        userEntry,
                        XUtils.decodeUTF8(message),
                        null,
                        mailID,
                        false,
                    ),
                );
            }
            Promise.allSettled(promises).then((results) => {
                for (const result of results) {
                    const { status } = result;
                    if (status === "rejected") {
                        this.log.warn("Message failed.");
                        this.log.warn(JSON.stringify(result));
                    }
                }
            });
        } catch (err) {
            this.log.error(
                "Message " + (err.message?.mailID || "") + " threw exception.",
            );
            this.log.error(err.toString());
            if (err.message?.mailID) {
                await this.database.deleteMessage(err.message.mailID);
            }
            throw err;
        }
    }

    private sendReceipt(nonce: Uint8Array) {
        const receipt: IReceiptMsg = {
            nonce,
            transmissionID: uuid.v4(),
            type: "receipt",
        };
        this.send(receipt);
    }

    private setAlive(status: boolean) {
        this.isAlive = status;
    }

    private setUser(user: IUser): void {
        this.user = user;
    }

    private async submitOTK(amount: number) {
        const otks: IPreKeysCrypto[] = [];

        const t0 = performance.now();
        for (let i = 0; i < amount; i++) {
            otks[i] = this.createPreKey();
        }
        const t1 = performance.now();

        this.log.info(
            "Generated " + amount + " one time keys in " + (t1 - t0) + " ms.",
        );

        const savedKeys = await this.database.savePreKeys(otks, true);

        await this.ax.post(
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

            await this.ax.post(
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
                        const progress: IFileProgress = {
                            direction: "upload",
                            loaded,
                            progress: percentCompleted,
                            token: this.getUser().userID,
                            total,
                        };
                        this.emit("fileProgress", progress);
                    },
                },
            );
            return;
        }

        const payload: { file: string } = {
            file: XUtils.encodeBase64(avatar),
        };
        await this.ax.post(
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
    ): Promise<IEmoji | null> {
        if (typeof FormData !== "undefined") {
            const fpayload = new FormData();
            fpayload.set("emoji", new Blob([new Uint8Array(emoji)]));
            fpayload.set("name", name);

            try {
                const res = await this.ax.post(
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
                            const progress: IFileProgress = {
                                direction: "upload",
                                loaded,
                                progress: percentCompleted,
                                token: name,
                                total,
                            };
                            this.emit("fileProgress", progress);
                        },
                    },
                );
                return msgpack.decode(new Uint8Array(res.data));
            } catch (err) {
                return null;
            }
        }

        const payload: { file: string; name: string } = {
            file: XUtils.encodeBase64(emoji),
            name,
        };
        try {
            const res = await this.ax.post(
                this.getHost() + "/emoji/" + serverID + "/json",
                msgpack.encode(payload),
                { headers: { "Content-Type": "application/msgpack" } },
            );
            return msgpack.decode(new Uint8Array(res.data));
        } catch (err) {
            return null;
        }
    }
}
