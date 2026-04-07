import { platformSuite } from "./harness/shared-suite.js";
import { nodeTestAdapters } from "./harness/platform-transports.js";
import { Storage } from "../Storage.js";
import type { IClientOptions } from "../index.js";

platformSuite(
    "node",
    nodeTestAdapters,
    (SK: string, opts: IClientOptions) => new Storage(":memory:", SK, opts),
);
