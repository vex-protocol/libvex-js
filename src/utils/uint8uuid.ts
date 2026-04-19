/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { parse as uuidParse } from "uuid";
/**
 * @ignore
 */
export function uuidToUint8(uuid: string) {
    return new Uint8Array(uuidParse(uuid));
}
