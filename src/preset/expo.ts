/**
 * Platform preset for Expo / React Native apps.
 *
 * - WebSocket: browser-native (React Native's global WebSocket)
 * - Storage:   expo-sqlite
 * - Logger:    console
 *
 * expo-sqlite is an optional peerDependency — only available in Expo apps.
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

export function expoPreset(): PlatformPreset {
    return {
        adapters: {
            logger,
            WebSocket: BrowserWebSocket as any,
        },
        async createStorage(dbName, privateKey, _logger) {
            const { createExpoStorage } = await import("../storage/expo.js");
            return createExpoStorage(dbName, privateKey, _logger ?? logger);
        },
    };
}
