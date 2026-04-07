import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        include: ["src/__tests__/platform-node.test.ts"],
        testTimeout: 15000,
        fileParallelism: false,
    },
});
