import { platformSuite } from "./harness/shared-suite.js";
import { browserTestAdapters } from "./harness/platform-transports.js";

platformSuite("browser/tauri", browserTestAdapters);
