import { platformSuite } from "./harness/shared-suite.js";
import { rnTestAdapters } from "./harness/platform-transports.js";
import { MemoryStorage } from "./harness/memory-storage.js";
import type { IClientOptions } from "../index.js";

platformSuite(
    "react-native",
    rnTestAdapters,
    (SK: string, _opts: IClientOptions) => {
        const storage = new MemoryStorage(SK);
        storage.init();
        return storage;
    },
);
