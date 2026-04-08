/**
 * Platform preset for tests — no I/O, no platform dependencies.
 *
 * - WebSocket: must be injected by the test (platform-specific)
 * - Storage:   in-memory (no persistence)
 * - Logger:    console
 */
import type { PlatformPreset } from "./types.js";
import type { ILogger } from "../transport/types.js";
import type { IWebSocketCtor } from "../transport/types.js";

const logger: ILogger = {
    info(m: string) {
        console.log(`[test] ${m}`);
    },
    warn(m: string) {
        console.warn(`[test] ${m}`);
    },
    error(m: string) {
        console.error(`[test] ${m}`);
    },
    debug() {},
};

export function testPreset(WebSocket: IWebSocketCtor): PlatformPreset {
    return {
        deviceName: "test",
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
    };
}
