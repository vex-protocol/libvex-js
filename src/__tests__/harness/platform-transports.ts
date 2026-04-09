/**
 * Test logger for integration tests.
 * WebSocket uses the native global via WebSocketAdapter internally.
 */

import type { Logger } from "../../transport/types.js";

const testLogger: Logger = {
    debug(_m: string) {},
    error(m: string) {
        console.error(`[test] ${m}`);
    },
    info(m: string) {
        console.log(`[test] ${m}`);
    },
    warn(m: string) {
        console.warn(`[test] ${m}`);
    },
};

export function browserTestLogger(): Logger {
    return testLogger;
}

export function nodeTestLogger(): Logger {
    return testLogger;
}
