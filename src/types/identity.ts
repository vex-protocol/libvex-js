/**
 * SDK credential storage types. Moved from @vex-chat/types
 * because only the SDK and app consumers use them.
 */

export interface KeyStore {
    clear(username: string): Promise<void>;
    load(username?: string): Promise<null | StoredCredentials>;
    save(creds: StoredCredentials): Promise<void>;
}

export interface StoredCredentials {
    deviceID: string;
    deviceKey: string;
    preKey?: string;
    token?: string;
    username: string;
}
