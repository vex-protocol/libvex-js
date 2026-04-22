/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { xConcat } from "@vex-chat/crypto";

export const FIPS_INITIAL_EXTRA_V1: readonly [number, number, number] = [
    0xf1, 0x02, 0x01,
] as const;

const FIPS_SUBSEQUENT_V1: readonly [number, number, number] = [
    0xf1, 0x03, 0x01,
] as const;

function u16be(n: number): [number, number] {
    if (!Number.isInteger(n) || n < 0 || n > 65535) {
        throw new Error(`FIPS: invalid u16 length: ${String(n)}`);
    }
    return [n >> 8, n & 0xff];
}

function u16read(buf: Uint8Array, offset: number): number {
    if (offset + 2 > buf.length) {
        return -1;
    }
    return ((buf[offset] ?? 0) * 256 + (buf[offset + 1] ?? 0)) >>> 0;
}

export function isFipsInitialExtraV1(buf: Uint8Array): boolean {
    return (
        buf.length >= 3 &&
        buf[0] === FIPS_INITIAL_EXTRA_V1[0] &&
        buf[1] === FIPS_INITIAL_EXTRA_V1[1] &&
        buf[2] === FIPS_INITIAL_EXTRA_V1[2]
    );
}

/**
 * P-256 fips (Web Crypto) initial mail `extra` bytes (version 1). Length-prefixed segments
 * (variable lengths) plus a 6-byte OTK index, AD length includes both identity raw publics.
 */
export function encodeFipsInitialExtraV1(
    signPub: Uint8Array,
    ephPub: Uint8Array,
    pk: Uint8Array,
    ad: Uint8Array,
    index6: Uint8Array,
): Uint8Array {
    if (index6.length !== 6) {
        throw new Error("FIPS: OTK index must be 6 bytes.");
    }
    const a = (len: number) => new Uint8Array([...u16be(len)]);
    return xConcat(
        Uint8Array.from([...FIPS_INITIAL_EXTRA_V1]),
        a(signPub.length),
        signPub,
        a(ephPub.length),
        ephPub,
        a(pk.length),
        pk,
        a(ad.length),
        ad,
        index6,
    );
}

/**
 * @returns [signKey, ephKey, ad, index6] (Uint8Array slices, index is always length 6)
 */
export function decodeFipsInitialExtraV1(
    extra: Uint8Array,
): [Uint8Array, Uint8Array, Uint8Array, Uint8Array] {
    if (!isFipsInitialExtraV1(extra)) {
        throw new Error("FIPS: not a v1 initial extra payload.");
    }
    let p = 3;
    const readSeg = (label: string) => {
        const len = u16read(extra, p);
        if (len < 0) {
            throw new Error(
                `FIPS: extra too short (need len for ${label} at ${String(p)}).`,
            );
        }
        p += 2;
        if (p + len > extra.length) {
            throw new Error(
                `FIPS: truncated ${label} segment (need ${String(len + p)} but got ${String(extra.length)}).`,
            );
        }
        const seg = extra.subarray(p, p + len);
        p += len;
        return seg;
    };
    const signKey = readSeg("sign");
    const ephKey = readSeg("eph");
    const _pk = readSeg("PK");
    const ad = readSeg("ad");
    void _pk; // not required for DH / open (matches tweetnacl extra layout)
    if (p + 6 > extra.length) {
        throw new Error("FIPS: missing 6-byte OTK index at end of extra.");
    }
    const index6 = extra.subarray(p, p + 6);
    return [signKey, ephKey, ad, index6];
}

export function isFipsSubsequentExtraV1(buf: Uint8Array): boolean {
    return (
        buf.length >= 3 &&
        buf[0] === FIPS_SUBSEQUENT_V1[0] &&
        buf[1] === FIPS_SUBSEQUENT_V1[1] &&
        buf[2] === FIPS_SUBSEQUENT_V1[2]
    );
}

/**
 * P-256 fips subsequent mail: session lookup key (variable, typically 65B uncompressed ECDH public).
 */
export function encodeFipsSubsequentExtraV1(
    sessionPub: Uint8Array,
): Uint8Array {
    if (sessionPub.length > 65535) {
        throw new Error("FIPS: session public key is too long.");
    }
    return xConcat(
        Uint8Array.from([...FIPS_SUBSEQUENT_V1]),
        new Uint8Array([...u16be(sessionPub.length)]),
        sessionPub,
    );
}

export function decodeFipsSubsequentExtraV1(extra: Uint8Array): Uint8Array {
    if (!isFipsSubsequentExtraV1(extra)) {
        throw new Error("FIPS: not a v1 subsequent extra.");
    }
    const len = u16read(extra, 3);
    if (len < 0) {
        throw new Error("FIPS: bad subsequent extra length field.");
    }
    const p = 5;
    if (p + len > extra.length) {
        throw new Error("FIPS: subsequent extra truncated.");
    }
    return extra.subarray(p, p + len);
}

/** P-256: message bytes signed to bind a prekey (FIPS) — 1-byte tag + uncompressed public. */
export function fipsP256PreKeySignPayload(
    preKeyRawPublic: Uint8Array,
): Uint8Array {
    return xConcat(new Uint8Array([0xa1]), preKeyRawPublic);
}

/**
 * P-256 identity AD: concatenation of our and their P-256 ECDH identity publics (uncompressed, 65B each if standard).
 * Used instead of `xEncode` + X25519 for FIPS.
 */
export function fipsP256AdFromIdentityPubs(
    ourIdentityRaw: Uint8Array,
    theirIdentityFromBundle: Uint8Array,
): Uint8Array {
    return xConcat(ourIdentityRaw, theirIdentityFromBundle);
}
