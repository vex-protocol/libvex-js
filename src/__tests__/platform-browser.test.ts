/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { ClientOptions } from "../index.js";

import { MemoryStorage } from "./harness/memory-storage.js";
// Browser platform test — covers Tauri, Expo/RN, and web.
// Runs with the poison plugin (vitest.config.browser.ts) which catches
// Node builtins and globals at compile time. Uses MemoryStorage (no
// Node SQLite) and BrowserTestWS (Uint8Array binary).
import { platformSuite } from "./harness/shared-suite.js";

platformSuite("browser", async (SK: string, _opts: ClientOptions) => {
    const storage = new MemoryStorage(SK);
    await storage.init();
    return storage;
});
