/**
 * File-backed KeyStore for Node.js (CLI tools, bots, integration tests).
 *
 * Stores credentials as encrypted files on disk using XUtils.encryptKeyData.
 * Node-only — imports node:fs.
 */
import { XUtils } from "@vex-chat/crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { KeyStore, StoredCredentials } from "@vex-chat/types";

export class NodeKeyStore implements KeyStore {
    private dir: string;

    constructor(dir: string = ".") {
        this.dir = dir;
    }

    private filePath(username: string): string {
        return path.join(this.dir, `${username}.vex`);
    }

    async load(username?: string): Promise<StoredCredentials | null> {
        if (username) {
            return this.readFile(this.filePath(username));
        }
        // Find most recent .vex file in the directory
        try {
            const files = fs
                .readdirSync(this.dir)
                .filter((f) => f.endsWith(".vex"))
                .map((f) => ({
                    name: f,
                    mtime: fs.statSync(path.join(this.dir, f)).mtimeMs,
                }))
                .sort((a, b) => b.mtime - a.mtime);
            if (files.length === 0) return null;
            return this.readFile(path.join(this.dir, files[0]!.name));
        } catch {
            return null;
        }
    }

    async save(creds: StoredCredentials): Promise<void> {
        const data = JSON.stringify(creds);
        const encrypted = XUtils.encryptKeyData("", data);
        fs.writeFileSync(this.filePath(creds.username), encrypted);
    }

    async clear(username: string): Promise<void> {
        try {
            fs.unlinkSync(this.filePath(username));
        } catch {
            // File may not exist
        }
    }

    private readFile(filePath: string): StoredCredentials | null {
        try {
            const data = fs.readFileSync(filePath);
            const decrypted = XUtils.decryptKeyData(new Uint8Array(data), "");
            return JSON.parse(decrypted) as StoredCredentials;
        } catch {
            return null;
        }
    }
}
