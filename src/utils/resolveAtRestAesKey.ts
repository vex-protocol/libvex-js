/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import {
    type CryptoProfile,
    xEcdhKeyPairFromEcdsaKeyPairAsync,
    xSignKeyPairFromSecret,
    xSignKeyPairFromSecretAsync,
    XKeyConvert,
    XUtils,
} from "@vex-chat/crypto";

/**
 * Produces the 32-byte at-rest key used by {@link Storage} (sqlite, memory) from
 * a hex signing secret, matching the derivation used by {@link Client.create}.
 * `setCryptoProfile(profile)` should already be in effect (or `tweetnacl` implied).
 */
export async function resolveAtRestAesKeyFromSignKeyHex(
    privateKeyHex: string,
    profile: CryptoProfile,
): Promise<Uint8Array> {
    const dec = XUtils.decodeHex(privateKeyHex);
    if (profile === "tweetnacl") {
        const sign = xSignKeyPairFromSecret(dec);
        const id = XKeyConvert.convertKeyPair(sign);
        if (!id) {
            throw new Error(
                "Could not convert signing key to X25519 identity.",
            );
        }
        return XUtils.deriveLocalAtRestAesKey(id.secretKey, "tweetnacl");
    }
    const sign = await xSignKeyPairFromSecretAsync(dec);
    const id = await xEcdhKeyPairFromEcdsaKeyPairAsync(sign);
    return XUtils.deriveLocalAtRestAesKey(id.secretKey, "fips");
}
