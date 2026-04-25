/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

/**
 * Platform preset for tests — no I/O, no platform dependencies.
 *
 * - WebSocket: native global (Node 22+)
 * - Storage:   in-memory (no persistence)
 */
import type { PlatformPreset } from "./common.js";

export function testPreset(): PlatformPreset {
    return {
        async createStorage(_dbName, privateKey) {
            const { getCryptoProfile } = await import("@vex-chat/crypto");
            const { resolveAtRestAesKeyFromSignKeyHex } =
                await import("../utils/resolveAtRestAesKey.js");
            const { MemoryStorage } =
                await import("../__tests__/harness/memory-storage.js");
            const atRest = await resolveAtRestAesKeyFromSignKeyHex(
                privateKey,
                getCryptoProfile(),
            );
            const storage = new MemoryStorage(atRest);
            await storage.init();
            return storage;
        },
        deviceName: "test",
    };
}
