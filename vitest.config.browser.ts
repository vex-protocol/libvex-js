import { defineConfig } from "vitest/config";
import { poisonNodeImports } from "./src/__tests__/harness/poison-node-imports.js";

export default defineConfig({
    plugins: [poisonNodeImports()],
    test: {
        globals: true,
        include: ["src/__tests__/platform-browser.test.ts"],
        testTimeout: 15000,
        hookTimeout: 30_000,
        fileParallelism: false,
    },
});
