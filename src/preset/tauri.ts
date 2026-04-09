import type { Storage } from "../Storage.js";
import type { Logger } from "../transport/types.js";
import type { PlatformPreset } from "./types.js";

/**
 * Platform preset for Tauri (desktop) apps.
 *
 * - WebSocket: browser-native (Tauri webview)
 * - Storage:   Kysely + kysely-dialect-tauri + @tauri-apps/plugin-sql
 * - Logger:    console
 */
import { BrowserWebSocket } from "../transport/browser.js";

const logger: Logger = {
    debug(m: string) {
        console.debug(`[vex] ${m}`);
    },
    error(m: string) {
        console.error(`[vex] ${m}`);
    },
    info(m: string) {
        console.log(`[vex] ${m}`);
    },
    warn(m: string) {
        console.warn(`[vex] ${m}`);
    },
};

export function tauriPreset(): PlatformPreset {
    return {
        adapters: {
            logger,
            WebSocket: BrowserWebSocket,
        },
        async createStorage(
            dbName,
            privateKey,
            storageLogger,
        ): Promise<Storage> {
            const { createTauriStorage } = await import("../storage/tauri.js");

            const storage: Storage = await createTauriStorage(
                dbName,
                privateKey,
                storageLogger,
            );
            return storage;
        },
        deviceName: navigator.platform,
    };
}
