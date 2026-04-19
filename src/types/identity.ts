/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

/**
 * SDK credential storage types. Moved from `@vex-chat/types`
 * because only the SDK and app consumers use them.
 */

/**
 * Persistent credential store used by apps to save/load login state
 * (e.g. Keychain on macOS, SecureStorage on mobile).
 */
export interface KeyStore {
    clear(username: string): Promise<void>;
    load(username?: string): Promise<null | StoredCredentials>;
    save(creds: StoredCredentials): Promise<void>;
}

/** Credentials persisted between sessions for auto-login. */
export interface StoredCredentials {
    deviceID: string;
    deviceKey: string;
    preKey?: string;
    token?: string;
    username: string;
}
