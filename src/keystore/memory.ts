/**
 * In-memory KeyStore for testing and ephemeral sessions.
 * No persistence — credentials are lost when the process exits.
 */
import type { KeyStore, StoredCredentials } from "../types/index.js";

export class MemoryKeyStore implements KeyStore {
    private readonly store = new Map<string, StoredCredentials>();

    async clear(username: string): Promise<void> {
        this.store.delete(username);
    }

    async load(username?: string): Promise<null | StoredCredentials> {
        if (username) {
            return this.store.get(username) ?? null;
        }
        // Return the most recently saved credentials
        const entries = [...this.store.values()];
        return entries.length > 0 ? entries[entries.length - 1] : null;
    }

    async save(creds: StoredCredentials): Promise<void> {
        this.store.set(creds.username, creds);
    }
}
