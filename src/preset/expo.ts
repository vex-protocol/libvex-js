import type { Storage } from "../Storage.js";
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
            WebSocket: BrowserWebSocket,
        },
        async createStorage(
            dbName,
            privateKey,
            storageLogger,
        ): Promise<Storage> {
            const { createExpoStorage } = await import("../storage/expo.js");

            const storage: Storage = await createExpoStorage(
                dbName,
                privateKey,
                storageLogger,
            );
            return storage;
        },
        deviceName: Platform.OS,
    };
}
