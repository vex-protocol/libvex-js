/**
 * Platform preset for Tauri (desktop) apps.
 *
 * - WebSocket: browser-native (Tauri webview)
 * - Storage:   @tauri-apps/plugin-sql (SQLite via Tauri IPC)
 * - Logger:    console
 */
import { BrowserWebSocket } from "../transport/browser.js";
import { TauriStorage } from "../storage/tauri.js";
import type { PlatformPreset } from "./types.js";
import type { ILogger } from "../transport/types.js";

const logger: ILogger = {
    info(m: string) {
        console.log(`[vex] ${m}`);
    },
    warn(m: string) {
        console.warn(`[vex] ${m}`);
    },
    error(m: string) {
        console.error(`[vex] ${m}`);
    },
    debug(m: string) {
        console.debug(`[vex] ${m}`);
    },
};

export function tauriPreset(): PlatformPreset {
    return {
        adapters: {
            logger,
            WebSocket: BrowserWebSocket as any,
        },
        async createStorage(dbName, privateKey, _logger) {
            const storage = new TauriStorage(
                dbName,
                privateKey,
                _logger ?? logger,
            );
            await storage.init();
            return storage;
        },
    };
}
