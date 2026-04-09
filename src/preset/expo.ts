import type { Logger } from "../transport/types.js";
import type { PlatformPreset } from "./types.js";

/**
 * Platform preset for Expo / React Native apps.
 *
 * - WebSocket: browser-native (React Native's global WebSocket)
 * - Storage:   Kysely + kysely-expo + expo-sqlite
 * - Logger:    console
 *
 * expo-sqlite and kysely-expo are optional peerDependencies.
 */
import { Platform } from "react-native";

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
        deviceName: Platform.OS,
    };
}
