/**
 * Run the Node e2e integration suite (vitest `node` project) against a local Spire.
 * This only sets `process.env` in the test child — it does not load a `.env` file.
 * Published `@vex-chat/libvex` is configured with `ClientOptions` in app code, not env.
 *
 * Defaults: NODE_ENV=test, API_URL=http://127.0.0.1:16777
 * Set DEV_API_KEY in the same shell/CI to match the running Spire.
 * Crypto profile: the suite reads GET /status and matches the server; set
 *   LIBVEX_E2E_CRYPTO=… only if you need to override.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vitestEntry = join(root, "node_modules", "vitest", "vitest.mjs");

if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = "test";
}
if (!process.env.API_URL) {
    process.env.API_URL = "http://127.0.0.1:16777";
}
if (!process.env.DEV_API_KEY?.trim()) {
    console.warn(
        "[test-local-spire] DEV_API_KEY is unset. Set it to match your Spire process, or you may get 429s on API calls.",
    );
}

if (!existsSync(vitestEntry)) {
    console.error(
        "[test-local-spire] vitest not found. Run `npm install` in libvex-js. Expected:\n  ",
        vitestEntry,
    );
    process.exit(1);
}

// Run Node e2e without shell:true (avoids Node DEP0190) and without --silent so
// the active test name is visible. Some slow cases can take tens of seconds.
const child = spawn(
    process.execPath,
    [
        vitestEntry,
        "run",
        "--project",
        "node",
        "--reporter=verbose",
    ],
    { cwd: root, env: process.env, stdio: "inherit" },
);
child.on("exit", (code) => {
    process.exit(typeof code === "number" ? code : 0);
});
