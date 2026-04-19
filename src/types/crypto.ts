/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

/**
 * SDK-internal crypto types. These were moved from `@vex-chat/types`
 * because they are only used by the SDK, never by the server.
 *
 * The KeyPair shape matches tweetnacl's `nacl.BoxKeyPair` without
 * importing from tweetnacl — future WASM migration only changes this file.
 */

/** A NaCl box key pair (Curve25519 public + secret). */
export interface KeyPair {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
}

/** Prekey after DB storage — index assigned by autoincrement. */
export interface PreKeysCrypto extends UnsavedPreKey {
    index: number;
}

/** In-memory representation of an encryption session (not yet persisted to SQL). */
export interface SessionCrypto {
    fingerprint: Uint8Array;
    lastUsed: string;
    mode: "initiator" | "receiver";
    publicKey: Uint8Array;
    sessionID: string;
    /** Shared secret key derived during X3DH. */
    SK: Uint8Array;
    userID: string;
}

/** Prekey before DB storage — no index yet. */
export interface UnsavedPreKey {
    keyPair: KeyPair;
    signature: Uint8Array;
}

export interface XKeyRing {
    ephemeralKeys: KeyPair;
    identityKeys: KeyPair;
    preKeys: PreKeysCrypto;
}
