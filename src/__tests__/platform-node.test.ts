import type { ClientOptions } from "../index.js";

import { createNodeStorage } from "../storage/node.js";

import { testLogger } from "./harness/platform-transports.js";
import { platformSuite } from "./harness/shared-suite.js";

platformSuite("node", testLogger, (SK: string, _opts: ClientOptions) =>
    Promise.resolve(createNodeStorage(":memory:", SK)),
);
