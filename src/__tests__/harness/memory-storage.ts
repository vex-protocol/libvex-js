/**
 * Minimal in-memory IStorage for browser/RN platform tests.
 *
 * Uses eventemitter3 (browser-safe) instead of Node's events module.
 * No persistence — just enough for the register/login/connect/DM test flow.
 */
import { EventEmitter } from "eventemitter3";
import { XKeyConvert, XUtils } from "@vex-chat/crypto";
import type {
    IDevice,
    IPreKeysCrypto,
    IPreKeysSQL,
    ISessionCrypto,
    ISessionSQL,
} from "@vex-chat/types";
import nacl from "tweetnacl";
import type { IMessage } from "../../index.js";
import type { IStorage } from "../../IStorage.js";

export class MemoryStorage extends EventEmitter implements IStorage {
    public ready = false;
    private messages: IMessage[] = [];
    private sessions: ISessionSQL[] = [];
    private preKeys: (IPreKeysSQL & { privateKey?: string })[] = [];
    private oneTimeKeys: (IPreKeysSQL & { privateKey?: string })[] = [];
    private devices: IDevice[] = [];
    private idKeys: nacl.BoxKeyPair;
    private nextPreKeyIndex = 1;
    private nextOtkIndex = 1;

    constructor(SK: string) {
        super();
        const idKeys = XKeyConvert.convertKeyPair(
            nacl.sign.keyPair.fromSecretKey(XUtils.decodeHex(SK)),
        );
        if (!idKeys) throw new Error("Can't convert SK!");
        this.idKeys = idKeys;
    }

    async init(): Promise<void> {
        this.ready = true;
        this.emit("ready");
    }

    async close(): Promise<void> {}

    async saveMessage(message: IMessage): Promise<void> {
        const copy = { ...message };
        copy.message = XUtils.encodeHex(
            nacl.secretbox(
                XUtils.decodeUTF8(message.message),
                XUtils.decodeHex(message.nonce),
                this.idKeys.secretKey,
            ),
        );
        this.messages.push(copy);
    }

    async deleteMessage(mailID: string): Promise<void> {
        this.messages = this.messages.filter((m) => m.mailID !== mailID);
    }

    async markSessionVerified(sessionID: string): Promise<void> {
        const s = this.sessions.find((s) => s.sessionID === sessionID);
        if (s) s.verified = true;
    }

    async markSessionUsed(sessionID: string): Promise<void> {
        const s = this.sessions.find((s) => s.sessionID === sessionID);
        if (s) s.lastUsed = new Date();
    }

    async getMessageHistory(userID: string): Promise<IMessage[]> {
        return this.messages
            .filter(
                (m) =>
                    (m.direction === "incoming" &&
                        m.authorID === userID &&
                        !m.group) ||
                    (m.direction === "outgoing" &&
                        m.readerID === userID &&
                        !m.group),
            )
            .map((m) => this.decryptMessage(m));
    }

    async getGroupHistory(channelID: string): Promise<IMessage[]> {
        return this.messages
            .filter((m) => m.group === channelID)
            .map((m) => this.decryptMessage(m));
    }

    async savePreKeys(
        preKeys: IPreKeysCrypto[],
        oneTime: boolean,
    ): Promise<IPreKeysSQL[]> {
        const added: IPreKeysSQL[] = [];
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
            });
        }
        return added;
    }

    async getPreKeys(): Promise<IPreKeysCrypto | null> {
        if (this.preKeys.length === 0) return null;
        const pk = this.preKeys[0];
        if (!pk.privateKey) return null;
        return {
            keyPair: nacl.box.keyPair.fromSecretKey(
                XUtils.decodeHex(pk.privateKey),
            ),
            signature: XUtils.decodeHex(pk.signature),
        };
    }

    async getOneTimeKey(index: number): Promise<IPreKeysCrypto | null> {
        const otk = this.oneTimeKeys.find((k) => k.index === index);
        if (!otk || !otk.privateKey) return null;
        return {
            keyPair: nacl.box.keyPair.fromSecretKey(
                XUtils.decodeHex(otk.privateKey),
            ),
            signature: XUtils.decodeHex(otk.signature),
            index: otk.index,
        };
    }

    async deleteOneTimeKey(index: number): Promise<void> {
        this.oneTimeKeys = this.oneTimeKeys.filter((k) => k.index !== index);
    }

    async getSessionByPublicKey(
        publicKey: Uint8Array,
    ): Promise<ISessionCrypto | null> {
        const hex = XUtils.encodeHex(publicKey);
        const s = this.sessions.find((s) => s.publicKey === hex);
        if (!s) return null;
        return this.sqlToCrypto(s);
    }

    async getAllSessions(): Promise<ISessionSQL[]> {
        return this.sessions.map((s) => ({
            ...s,
            verified: Boolean(s.verified),
        }));
    }

    async getSessionByDeviceID(
        deviceID: string,
    ): Promise<ISessionCrypto | null> {
        const s = this.sessions.find((s) => s.deviceID === deviceID);
        if (!s) return null;
        return this.sqlToCrypto(s);
    }

    async saveSession(session: ISessionSQL): Promise<void> {
        if (!this.sessions.find((s) => s.SK === session.SK)) {
            this.sessions.push(session);
        }
    }

    async getDevice(deviceID: string): Promise<IDevice | null> {
        return this.devices.find((d) => d.deviceID === deviceID) ?? null;
    }

    async saveDevice(device: IDevice): Promise<void> {
        if (!this.devices.find((d) => d.deviceID === device.deviceID)) {
            this.devices.push(device);
        }
    }

    async purgeHistory(): Promise<void> {
        this.messages = [];
    }

    async purgeKeyData(): Promise<void> {
        this.sessions = [];
        this.preKeys = [];
        this.oneTimeKeys = [];
        this.messages = [];
    }

    async deleteHistory(channelOrUserID: string): Promise<void> {
        this.messages = this.messages.filter(
            (m) =>
                m.group !== channelOrUserID &&
                m.authorID !== channelOrUserID &&
                m.readerID !== channelOrUserID,
        );
    }

    private decryptMessage(msg: IMessage): IMessage {
        const copy = { ...msg };
        copy.timestamp = new Date(copy.timestamp);
        copy.decrypted = Boolean(copy.decrypted);
        if (copy.decrypted) {
            const dec = nacl.secretbox.open(
                XUtils.decodeHex(copy.message),
                XUtils.decodeHex(copy.nonce),
                this.idKeys.secretKey,
            );
            if (dec) copy.message = XUtils.encodeUTF8(dec);
        }
        return copy;
    }

    private sqlToCrypto(s: ISessionSQL): ISessionCrypto {
        return {
            sessionID: s.sessionID,
            userID: s.userID,
            mode: s.mode,
            SK: XUtils.decodeHex(s.SK),
            publicKey: XUtils.decodeHex(s.publicKey),
            lastUsed: s.lastUsed,
            fingerprint: XUtils.decodeHex(s.fingerprint),
        };
    }
}
