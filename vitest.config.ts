import { defineConfig } from "vitest/config";
import { poisonNodeImports } from "./src/__tests__/harness/poison-node-imports.js";

export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: "node",
                    globals: true,
                    include: ["src/__tests__/platform-node.test.ts"],
                    testTimeout: 15_000,
                    hookTimeout: 30_000,
                    fileParallelism: false,
                    silent: true,
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
                    silent: true,
                },
            },
        ],
    },
});
