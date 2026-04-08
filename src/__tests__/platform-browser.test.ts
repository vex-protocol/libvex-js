// Browser platform test — covers Tauri, Expo/RN, and web.
// Runs with the poison plugin (vitest.config.browser.ts) which catches
// Node builtins and globals at compile time. Uses MemoryStorage (no
// Node SQLite) and BrowserTestWS (Uint8Array binary).
import { platformSuite } from "./harness/shared-suite.js";
import { browserTestAdapters } from "./harness/platform-transports.js";
import { MemoryStorage } from "./harness/memory-storage.js";
import type { IClientOptions } from "../index.js";

platformSuite(
    "browser",
    browserTestAdapters,
    (SK: string, _opts: IClientOptions) => {
        const storage = new MemoryStorage(SK);
        storage.init();
        return storage;
    },
);
