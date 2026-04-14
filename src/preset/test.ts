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
            const { MemoryStorage } =
                await import("../__tests__/harness/memory-storage.js");
            const storage = new MemoryStorage(privateKey);
            await storage.init();
            return storage;
        },
        deviceName: "test",
    };
}
