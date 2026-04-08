import type { ISessionSQL } from "@vex-chat/types";
import type { ISessionCrypto } from "../types/index.js";

import { XUtils } from "@vex-chat/crypto";

export function sqlSessionToCrypto(session: ISessionSQL): ISessionCrypto {
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
