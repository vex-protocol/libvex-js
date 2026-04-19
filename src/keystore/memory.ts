/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

/**
 * In-memory KeyStore for testing and ephemeral sessions.
 * No persistence — credentials are lost when the process exits.
 */
import type { KeyStore, StoredCredentials } from "../types/index.js";

export class MemoryKeyStore implements KeyStore {
    private readonly store = new Map<string, StoredCredentials>();

    clear(username: string): Promise<void> {
        this.store.delete(username);
        return Promise.resolve();
    }

    load(username?: string): Promise<null | StoredCredentials> {
        if (username) {
            return Promise.resolve(this.store.get(username) ?? null);
        }
        // Return the most recently saved credentials
        const entries = [...this.store.values()];
        return Promise.resolve(
            entries.length > 0 ? (entries[entries.length - 1] ?? null) : null,
        );
    }

    save(creds: StoredCredentials): Promise<void> {
        this.store.set(creds.username, creds);
        return Promise.resolve();
    }
}
