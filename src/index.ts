export { Client } from "./Client.js";
export type {
    Channel,
    Channels,
    ClientOptions,
    Device,
    Devices,
    Emojis,
    VexFile,
    FileProgress,
    FileRes,
    Files,
    Invites,
    Keys,
    Me,
    Message,
    Messages,
    Moderation,
    Permission,
    Permissions,
    Server,
    Servers,
    Session,
    Sessions,
    User,
    Users,
} from "./Client.js";
export { createCodec, msgpack } from "./codec.js";
export type { Storage } from "./Storage.js";

export type { PlatformPreset } from "./preset/types.js";
export type {
    ClientAdapters,
    Logger,
    WebSocketCtor,
    WebSocketLike,
} from "./transport/types.js";
export type { KeyStore, StoredCredentials } from "./types/index.js";
// Re-export app-facing types
export type { Invite } from "@vex-chat/types";
