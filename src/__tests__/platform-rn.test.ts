import { platformSuite } from "./harness/shared-suite.js";
import { rnTestAdapters } from "./harness/platform-transports.js";
import { MemoryStorage } from "./harness/memory-storage.js";
import type { IClientOptions } from "../index.js";

// TODO: connect + DM tests fail because iOS React Native's WebSocket does not
// forward cookies from the shared cookie jar on the HTTP upgrade request.
// Spire uses cookie-based WS auth, so connect() never authenticates.
// Fix: implement token-based WS auth in spire (pass token as query param or
// first message) so RN can authenticate without cookies on the upgrade.
platformSuite(
    "react-native",
    rnTestAdapters,
    (SK: string, _opts: IClientOptions) => {
        const storage = new MemoryStorage(SK);
        storage.init();
        return storage;
    },
);
