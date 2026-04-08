import type { ILogger } from "../transport/types.js";
import type { IWebSocketCtor } from "../transport/types.js";
/**
 * Platform preset for tests — no I/O, no platform dependencies.
 *
 * - WebSocket: must be injected by the test (platform-specific)
 * - Storage:   in-memory (no persistence)
 * - Logger:    console
 */
import type { PlatformPreset } from "./types.js";

const logger: ILogger = {
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

export function testPreset(WebSocket: IWebSocketCtor): PlatformPreset {
    return {
        adapters: {
            logger,
            WebSocket,
        },
        async createStorage(dbName, privateKey, _logger) {
            // Lazy import to avoid pulling eventemitter3 into the type graph
            const { MemoryStorage } =
                await import("../__tests__/harness/memory-storage.js");
            const storage = new MemoryStorage(privateKey);
            await storage.init();
            return storage;
        },
        deviceName: "test",
    };
}
