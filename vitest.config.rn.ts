import { defineConfig } from "vitest/config";
import { poisonNodeImports } from "./src/__tests__/harness/poison-node-imports.js";

export default defineConfig({
    plugins: [poisonNodeImports()],
    test: {
        globals: true,
        include: ["src/__tests__/platform-rn.test.ts"],
        testTimeout: 15000,
        fileParallelism: false,
    },
});
