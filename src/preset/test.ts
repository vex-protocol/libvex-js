import type { Logger } from "../transport/types.js";
/**
 * Platform preset for tests — no I/O, no platform dependencies.
 *
 * - WebSocket: native global (Node 22+)
 * - Storage:   in-memory (no persistence)
 * - Logger:    console
 */
import type { PlatformPreset } from "./common.js";

const logger: Logger = {
    debug() {},
    error(m: string) {
        console.error(`[test] ${m}`);
    },
    info(m: string) {
        console.log(`[test] ${m}`);
    },
    warn(m: string) {
        console.warn(`[test] ${m}`);
    },
};

export function testPreset(): PlatformPreset {
    return {
        async createStorage(_dbName, privateKey, _logger) {
            // Lazy import to avoid pulling eventemitter3 into the type graph
            const { MemoryStorage } =
                await import("../__tests__/harness/memory-storage.js");
            const storage = new MemoryStorage(privateKey);
            await storage.init();
            return storage;
        },
        deviceName: "test",
        logger,
    };
}
