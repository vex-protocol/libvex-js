import type { IClientOptions } from "../index.js";

import { MemoryStorage } from "./harness/memory-storage.js";
import { browserTestAdapters } from "./harness/platform-transports.js";
// Browser platform test — covers Tauri, Expo/RN, and web.
// Runs with the poison plugin (vitest.config.browser.ts) which catches
// Node builtins and globals at compile time. Uses MemoryStorage (no
// Node SQLite) and BrowserTestWS (Uint8Array binary).
import { platformSuite } from "./harness/shared-suite.js";

platformSuite(
    "browser",
    browserTestAdapters,
    async (SK: string, _opts: IClientOptions) => {
        const storage = new MemoryStorage(SK);
        await storage.init();
        return storage;
    },
);
