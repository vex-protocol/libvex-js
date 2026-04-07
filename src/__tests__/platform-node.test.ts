import { platformSuite } from "./harness/shared-suite.js";
import { nodeTestAdapters } from "./harness/platform-transports.js";
import { createNodeStorage } from "../storage/node.js";
import type { IClientOptions } from "../index.js";

platformSuite("node", nodeTestAdapters, (SK: string, _opts: IClientOptions) =>
    createNodeStorage(":memory:", SK),
);
