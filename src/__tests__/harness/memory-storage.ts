/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Message } from "../../index.js";
import type { Storage } from "../../Storage.js";
import type {
    PreKeysCrypto,
    SessionCrypto,
    UnsavedPreKey,
} from "../../types/index.js";
import type { Device, PreKeysSQL, SessionSQL } from "@vex-chat/types";

import {
    getCryptoProfile,
    xBoxKeyPairFromSecret,
    xBoxKeyPairFromSecretAsync,
    xSecretbox,
    xSecretboxAsync,
    xSecretboxOpen,
    xSecretboxOpenAsync,
    XUtils,
} from "@vex-chat/crypto";

/**
 * Minimal in-memory Storage for browser/RN platform tests.
 *
 * Uses eventemitter3 (browser-safe) instead of Node's events module.
 * No persistence — just enough for the register/login/connect/DM test flow.
 */
import { EventEmitter } from "eventemitter3";

export class MemoryStorage extends EventEmitter implements Storage {
    public ready = false;
    private readonly devices: Device[] = [];
    private readonly atRestAesKey: Uint8Array;
    private messages: Message[] = [];
    private nextOtkIndex = 1;
    private nextPreKeyIndex = 1;
    private oneTimeKeys: any[] = [];
    private preKeys: any[] = [];
    private sessions: SessionSQL[] = [];

    constructor(atRestAesKey: Uint8Array) {
        super();
        if (atRestAesKey.length !== 32) {
            throw new Error("MemoryStorage requires a 32-byte atRestAes key.");
        }
        this.atRestAesKey = atRestAesKey;
    }

    close(): Promise<void> {
        return Promise.resolve();
    }

    deleteHistory(channelOrUserID: string): Promise<void> {
        this.messages = this.messages.filter(
            (m) =>
                m.group !== channelOrUserID &&
                m.authorID !== channelOrUserID &&
                m.readerID !== channelOrUserID,
        );
        return Promise.resolve();
    }

    deleteMessage(mailID: string): Promise<void> {
        this.messages = this.messages.filter((m) => m.mailID !== mailID);
        return Promise.resolve();
    }

    deleteOneTimeKey(index: number): Promise<void> {
        this.oneTimeKeys = this.oneTimeKeys.filter((k) => k.index !== index);
        return Promise.resolve();
    }

    getAllSessions(): Promise<SessionSQL[]> {
        return Promise.resolve(
            this.sessions.map((s) => ({
                ...s,
                verified: s.verified,
            })),
        );
    }

    getDevice(deviceID: string): Promise<Device | null> {
        return Promise.resolve(
            this.devices.find((d) => d.deviceID === deviceID) ?? null,
        );
    }

    async getGroupHistory(channelID: string): Promise<Message[]> {
        const rows = this.messages.filter((m) => m.group === channelID);
        return Promise.all(rows.map((m) => this.decryptMessage(m)));
    }

    async getMessageHistory(userID: string): Promise<Message[]> {
        const rows = this.messages.filter(
            (m) =>
                (m.direction === "incoming" &&
                    m.authorID === userID &&
                    !m.group) ||
                (m.direction === "outgoing" &&
                    m.readerID === userID &&
                    !m.group),
        );
        return Promise.all(rows.map((m) => this.decryptMessage(m)));
    }

    async getOneTimeKey(index: number): Promise<null | PreKeysCrypto> {
        const otk = this.oneTimeKeys.find((k) => k.index === index);
        if (!otk || !otk.privateKey) return Promise.resolve(null);
        const sk = XUtils.decodeHex(otk.privateKey);
        return {
            index: otk.index,
            keyPair:
                getCryptoProfile() === "fips"
                    ? await xBoxKeyPairFromSecretAsync(sk)
                    : xBoxKeyPairFromSecret(sk),
            signature: XUtils.decodeHex(otk.signature),
        };
    }

    async getPreKeys(): Promise<null | PreKeysCrypto> {
        if (this.preKeys.length === 0) return Promise.resolve(null);
        const pk = this.preKeys[0];
        if (!pk.privateKey) return Promise.resolve(null);
        const sk = XUtils.decodeHex(pk.privateKey);
        return {
            index: pk.index,
            keyPair:
                getCryptoProfile() === "fips"
                    ? await xBoxKeyPairFromSecretAsync(sk)
                    : xBoxKeyPairFromSecret(sk),
            signature: XUtils.decodeHex(pk.signature),
        };
    }

    getSessionByDeviceID(deviceID: string): Promise<null | SessionCrypto> {
        const s = this.sessions.find((s) => s.deviceID === deviceID);
        if (!s) return Promise.resolve(null);
        return Promise.resolve(this.sqlToCrypto(s));
    }

    getSessionByPublicKey(
        publicKey: Uint8Array,
    ): Promise<null | SessionCrypto> {
        const hex = XUtils.encodeHex(publicKey);
        const s = this.sessions.find((s) => s.publicKey === hex);
        if (!s) return Promise.resolve(null);
        return Promise.resolve(this.sqlToCrypto(s));
    }

    init(): Promise<void> {
        this.ready = true;
        this.emit("ready");
        return Promise.resolve();
    }

    markSessionUsed(sessionID: string): Promise<void> {
        const s = this.sessions.find((s) => s.sessionID === sessionID);
        if (s) s.lastUsed = new Date().toISOString();
        return Promise.resolve();
    }

    markSessionVerified(sessionID: string): Promise<void> {
        const s = this.sessions.find((s) => s.sessionID === sessionID);
        if (s) s.verified = true;
        return Promise.resolve();
    }

    purgeHistory(): Promise<void> {
        this.messages = [];
        return Promise.resolve();
    }

    purgeKeyData(): Promise<void> {
        this.sessions = [];
        this.preKeys = [];
        this.oneTimeKeys = [];
        this.messages = [];
        return Promise.resolve();
    }

    saveDevice(device: Device): Promise<void> {
        if (!this.devices.find((d) => d.deviceID === device.deviceID)) {
            this.devices.push(device);
        }
        return Promise.resolve();
    }

    async saveMessage(message: Message): Promise<void> {
        const copy = { ...message };
        const fips = getCryptoProfile() === "fips";
        const ct = fips
            ? await xSecretboxAsync(
                  XUtils.decodeUTF8(message.message),
                  XUtils.decodeHex(message.nonce),
                  this.atRestAesKey,
              )
            : xSecretbox(
                  XUtils.decodeUTF8(message.message),
                  XUtils.decodeHex(message.nonce),
                  this.atRestAesKey,
              );
        copy.message = XUtils.encodeHex(ct);
        this.messages.push(copy);
    }

    savePreKeys(
        preKeys: UnsavedPreKey[],
        oneTime: boolean,
    ): Promise<PreKeysSQL[]> {
        const added: PreKeysSQL[] = [];
        for (const pk of preKeys) {
            const idx = oneTime ? this.nextOtkIndex++ : this.nextPreKeyIndex++;
            const row = {
                index: idx,
                privateKey: XUtils.encodeHex(pk.keyPair.secretKey),
                publicKey: XUtils.encodeHex(pk.keyPair.publicKey),
                signature: XUtils.encodeHex(pk.signature),
            };
            if (oneTime) this.oneTimeKeys.push(row);
            else this.preKeys.push(row);
            // Return without privateKey (matches real Storage behavior)
            added.push({
                index: idx,
                publicKey: row.publicKey,
                signature: row.signature,
            } as PreKeysSQL);
        }
        return Promise.resolve(added);
    }

    saveSession(session: SessionSQL): Promise<void> {
        if (!this.sessions.find((s) => s.SK === session.SK)) {
            this.sessions.push(session);
        }
        return Promise.resolve();
    }

    private async decryptMessage(msg: Message): Promise<Message> {
        const copy = { ...msg };
        if (copy.decrypted) {
            const fips = getCryptoProfile() === "fips";
            const dec = fips
                ? await xSecretboxOpenAsync(
                      XUtils.decodeHex(copy.message),
                      XUtils.decodeHex(copy.nonce),
                      this.atRestAesKey,
                  )
                : xSecretboxOpen(
                      XUtils.decodeHex(copy.message),
                      XUtils.decodeHex(copy.nonce),
                      this.atRestAesKey,
                  );
            if (dec) copy.message = XUtils.encodeUTF8(dec);
        }
        return copy;
    }

    private sqlToCrypto(s: SessionSQL): SessionCrypto {
        return {
            fingerprint: XUtils.decodeHex(s.fingerprint),
            lastUsed: s.lastUsed,
            mode: s.mode,
            publicKey: XUtils.decodeHex(s.publicKey),
            sessionID: s.sessionID,
            SK: XUtils.decodeHex(s.SK),
            userID: s.userID,
        };
    }
}
