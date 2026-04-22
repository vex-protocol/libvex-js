/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { KeyStore, StoredCredentials } from "../types/index.js";

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * File-backed KeyStore for Node.js (CLI tools, bots, integration tests).
 *
 * Stores credentials as encrypted files on disk using XUtils.encryptKeyData.
 * Node-only — imports node:fs.
 */
import { getCryptoProfile, XUtils } from "@vex-chat/crypto";

export class NodeKeyStore implements KeyStore {
    private readonly dir: string;
    private readonly passphrase: string;

    constructor(passphrase: string, dir: string = ".") {
        if (!passphrase) {
            throw new Error(
                "NodeKeyStore requires a non-empty passphrase. " +
                    "The caller must supply a passphrase sourced from user input, OS keychain, or similar.",
            );
        }
        this.passphrase = passphrase;
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
            if (files.length === 0) return Promise.resolve(null);
            const newest = files[0];
            if (!newest) return Promise.resolve(null);
            return this.readFile(path.join(this.dir, newest.name));
        } catch {
            return Promise.resolve(null);
        }
    }

    async save(creds: StoredCredentials): Promise<void> {
        const data = JSON.stringify(creds);
        const encrypted =
            getCryptoProfile() === "fips"
                ? await XUtils.encryptKeyDataAsync(this.passphrase, data)
                : XUtils.encryptKeyData(this.passphrase, data);
        fs.writeFileSync(this.filePath(creds.username), encrypted);
    }

    private filePath(username: string): string {
        return path.join(this.dir, `${username}.vex`);
    }

    private async readFile(
        filePath: string,
    ): Promise<null | StoredCredentials> {
        try {
            const data = fs.readFileSync(filePath);
            const decrypted =
                getCryptoProfile() === "fips"
                    ? await XUtils.decryptKeyDataAsync(
                          new Uint8Array(data),
                          this.passphrase,
                      )
                    : XUtils.decryptKeyData(
                          new Uint8Array(data),
                          this.passphrase,
                      );
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
