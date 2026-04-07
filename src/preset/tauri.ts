/**
 * Platform preset for Tauri (desktop) apps.
 *
 * - WebSocket: browser-native (Tauri webview)
 * - Storage:   Kysely + kysely-dialect-tauri + @tauri-apps/plugin-sql
 * - Logger:    console
 */
import { BrowserWebSocket } from "../transport/browser.js";
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
            const { createTauriStorage } = await import("../storage/tauri.js");
            return createTauriStorage(dbName, privateKey, _logger ?? logger);
        },
    };
}
