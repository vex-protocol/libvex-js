/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Storage } from "../Storage.js";

/** Internal preset interface used by nodePreset and testPreset. */
export interface PlatformPreset {
    createStorage(dbName: string, privateKey: string): Promise<Storage>;
    deviceName: string;
}
