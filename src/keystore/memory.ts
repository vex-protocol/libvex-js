/**
 * In-memory KeyStore for testing and ephemeral sessions.
 * No persistence — credentials are lost when the process exits.
 */
import type { KeyStore, StoredCredentials } from "@vex-chat/types";

export class MemoryKeyStore implements KeyStore {
    private store = new Map<string, StoredCredentials>();

    async load(username?: string): Promise<StoredCredentials | null> {
        if (username) {
            return this.store.get(username) ?? null;
        }
        // Return the most recently saved credentials
        const entries = [...this.store.values()];
        return entries.length > 0 ? entries[entries.length - 1]! : null;
    }

    async save(creds: StoredCredentials): Promise<void> {
        this.store.set(creds.username, creds);
    }

    async clear(username: string): Promise<void> {
        this.store.delete(username);
    }
}
