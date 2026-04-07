import { platformSuite } from "./harness/shared-suite.js";
import { nodeTestAdapters } from "./harness/platform-transports.js";

platformSuite("node", nodeTestAdapters);
