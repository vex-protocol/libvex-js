import { defineWorkspace } from "vitest/config";
import { poisonNodeImports } from "./src/__tests__/harness/poison-node-imports.js";

export default defineWorkspace([
    {
        test: {
            name: "node",
            globals: true,
            include: ["src/__tests__/platform-node.test.ts"],
            testTimeout: 15_000,
            hookTimeout: 30_000,
            fileParallelism: false,
        },
    },
    {
        plugins: [poisonNodeImports()],
        test: {
            name: "browser",
            globals: true,
            include: ["src/__tests__/platform-browser.test.ts"],
            testTimeout: 15_000,
            hookTimeout: 30_000,
            fileParallelism: false,
        },
    },
]);
