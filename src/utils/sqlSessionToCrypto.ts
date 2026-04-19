/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { SessionCrypto } from "../types/index.js";
import type { SessionSQL } from "@vex-chat/types";

import { XUtils } from "@vex-chat/crypto";

export function sqlSessionToCrypto(session: SessionSQL): SessionCrypto {
    return {
        fingerprint: XUtils.decodeHex(session.fingerprint),
        lastUsed: session.lastUsed,
        mode: session.mode,
        publicKey: XUtils.decodeHex(session.publicKey),
        sessionID: session.sessionID,
        SK: XUtils.decodeHex(session.SK),
        userID: session.userID,
    };
}
