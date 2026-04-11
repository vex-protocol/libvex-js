/**
 * Test logger for integration tests.
 */
import type { Logger } from "../../transport/types.js";

export const testLogger: Logger = {
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
