import { platformSuite } from "./harness/shared-suite.js";
import { rnTestAdapters } from "./harness/platform-transports.js";

platformSuite("react-native", rnTestAdapters);
