import { platformSuite } from "./harness/shared-suite.js";
import { rnTestAdapters } from "./harness/platform-transports.js";
import { MemoryStorage } from "./harness/memory-storage.js";
import type { IClientOptions } from "../index.js";

// All 4 tests pass after ADR-006 (post-connection WS auth).
// Auth is sent as the first message after open — no cookies needed on upgrade.
platformSuite(
    "react-native",
    rnTestAdapters,
    (SK: string, _opts: IClientOptions) => {
        const storage = new MemoryStorage(SK);
        storage.init();
        return storage;
    },
);
