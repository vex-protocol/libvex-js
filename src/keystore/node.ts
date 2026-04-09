import type { KeyStore, StoredCredentials } from "../types/index.js";

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * File-backed KeyStore for Node.js (CLI tools, bots, integration tests).
 *
 * Stores credentials as encrypted files on disk using XUtils.encryptKeyData.
 * Node-only — imports node:fs.
 */
import { XUtils } from "@vex-chat/crypto";

export class NodeKeyStore implements KeyStore {
    private readonly dir: string;

    constructor(dir: string = ".") {
        this.dir = dir;
    }

    clear(username: string): Promise<void> {
        try {
            fs.unlinkSync(this.filePath(username));
        } catch {
            // File may not exist
        }
        return Promise.resolve();
    }

    load(username?: string): Promise<null | StoredCredentials> {
        if (username) {
            return Promise.resolve(this.readFile(this.filePath(username)));
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
            if (files.length === 0) return Promise.resolve(null);
            return Promise.resolve(
                this.readFile(path.join(this.dir, files[0].name)),
            );
        } catch {
            return Promise.resolve(null);
        }
    }

    save(creds: StoredCredentials): Promise<void> {
        const data = JSON.stringify(creds);
        const encrypted = XUtils.encryptKeyData("", data);
        fs.writeFileSync(this.filePath(creds.username), encrypted);
        return Promise.resolve();
    }

    private filePath(username: string): string {
        return path.join(this.dir, `${username}.vex`);
    }

    private readFile(filePath: string): null | StoredCredentials {
        try {
            const data = fs.readFileSync(filePath);
            const decrypted = XUtils.decryptKeyData(new Uint8Array(data), "");
            const parsed: unknown = JSON.parse(decrypted);
            if (isStoredCredentials(parsed)) {
                return parsed;
            }
            return null;
        } catch {
            return null;
        }
    }
}

function isStoredCredentials(value: unknown): value is StoredCredentials {
    if (typeof value !== "object" || value === null) return false;
    return (
        "username" in value &&
        typeof value.username === "string" &&
        "deviceID" in value &&
        typeof value.deviceID === "string" &&
        "deviceKey" in value &&
        typeof value.deviceKey === "string"
    );
}
