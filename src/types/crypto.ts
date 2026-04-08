/**
 * SDK-internal crypto types. These were moved from @vex-chat/types
 * because they are only used by the SDK, never by the server.
 *
 * The KeyPair shape matches tweetnacl's nacl.BoxKeyPair without
 * importing from tweetnacl — future WASM migration only changes this file.
 */

export interface KeyPair {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
}

export interface IXKeyRing {
    ephemeralKeys: KeyPair;
    identityKeys: KeyPair;
    preKeys: IPreKeysCrypto;
}

export interface IPreKeysCrypto {
    index?: number;
    keyPair: KeyPair;
    signature: Uint8Array;
}

export interface ISessionCrypto {
    fingerprint: Uint8Array;
    lastUsed: Date;
    mode: "initiator" | "receiver";
    publicKey: Uint8Array;
    sessionID: string;
    SK: Uint8Array;
    userID: string;
}
