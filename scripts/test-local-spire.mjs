/**
 * Run the Node e2e integration suite (vitest `node` project) against a local Spire.
 * This only sets `process.env` in the test child — it does not load a `.env` file.
 * Published `@vex-chat/libvex` is configured with `ClientOptions` in app code, not env.
 *
 * Defaults: NODE_ENV=test, API_URL=http://127.0.0.1:16777
 * Set DEV_API_KEY in the same shell/CI to match the running Spire.
 * FIPS Spire: the suite auto-detects from GET /status; only set
 *   LIBVEX_E2E_CRYPTO=… if you need to override.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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

const child = spawn(
    "npx",
    ["vitest", "run", "--project", "node", "--silent"],
    { cwd: root, env: process.env, stdio: "inherit", shell: true },
);
child.on("exit", (code) => {
    process.exit(typeof code === "number" ? code : 0);
});
