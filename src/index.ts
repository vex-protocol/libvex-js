export { Client } from "./Client.js";
export type {
    IChannel,
    IChannels,
    IClientOptions,
    IDevice,
    IDevices,
    IEmojis,
    IFile,
    IFileProgress,
    IFileRes,
    IFiles,
    IInvites,
    IKeys,
    IMe,
    IMessage,
    IMessages,
    IModeration,
    IPermission,
    IPermissions,
    IServer,
    IServers,
    ISession,
    ISessions,
    IUser,
    IUsers,
} from "./Client.js";
export type { IStorage } from "./IStorage.js";

export type { PlatformPreset } from "./preset/types.js";
export type {
    IClientAdapters,
    ILogger,
    IWebSocketCtor,
    IWebSocketLike,
} from "./transport/types.js";
// Re-export app-facing types from @vex-chat/types so apps only depend on libvex
export type { IInvite, KeyStore, StoredCredentials } from "@vex-chat/types";
