export { Client } from "./Client.js";
export type {
    IChannels,
    IChannel,
    IClientOptions,
    IDevices,
    IEmojis,
    IDevice,
    IFile,
    IFiles,
    IFileProgress,
    IFileRes,
    IInvites,
    IKeys,
    IMe,
    IMessage,
    IMessages,
    IModeration,
    IPermission,
    IPermissions,
    IServers,
    IServer,
    ISessions,
    ISession,
    IUser,
    IUsers,
} from "./Client.js";
export type { IStorage } from "./IStorage.js";

// Re-export app-facing types from @vex-chat/types so apps only depend on libvex
export type { KeyStore, StoredCredentials, IInvite } from "@vex-chat/types";
export type {
    IClientAdapters,
    ILogger,
    IWebSocketCtor,
    IWebSocketLike,
} from "./transport/types.js";
