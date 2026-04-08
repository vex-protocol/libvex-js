import type { KeyStore, StoredCredentials } from "../types/index.js";

/**
 * File-backed KeyStore for Node.js (CLI tools, bots, integration tests).
 *
 * Stores credentials as encrypted files on disk using XUtils.encryptKeyData.
 * Node-only — imports node:fs.
 */
import { XUtils } from "@vex-chat/crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export class NodeKeyStore implements KeyStore {
    private readonly dir: string;

    constructor(dir: string = ".") {
        this.dir = dir;
    }

    async clear(username: string): Promise<void> {
        try {
            fs.unlinkSync(this.filePath(username));
        } catch {
            // File may not exist
        }
    }

    async load(username?: string): Promise<null | StoredCredentials> {
        if (username) {
            return this.readFile(this.filePath(username));
        }
        // Find most recent .vex file in the directory
        try {
            const files = fs
                .readdirSync(this.dir)
                .filter((f) => f.endsWith(".vex"))
                .map((f) => ({
                    mtime: fs.statSync(path.join(this.dir, f)).mtimeMs,
                    name: f,
                }))
                .sort((a, b) => b.mtime - a.mtime);
            if (files.length === 0) return null;
            return this.readFile(path.join(this.dir, files[0].name));
        } catch {
            return null;
        }
    }

    async save(creds: StoredCredentials): Promise<void> {
        const data = JSON.stringify(creds);
        const encrypted = XUtils.encryptKeyData("", data);
        fs.writeFileSync(this.filePath(creds.username), encrypted);
    }

    private filePath(username: string): string {
        return path.join(this.dir, `${username}.vex`);
    }

    private readFile(filePath: string): null | StoredCredentials {
        try {
            const data = fs.readFileSync(filePath);
            const decrypted = XUtils.decryptKeyData(new Uint8Array(data), "");
            return JSON.parse(decrypted) as StoredCredentials;
        } catch {
            return null;
        }
    }
}
