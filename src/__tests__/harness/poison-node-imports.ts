/**
 * Vite plugin that makes Node-only modules throw when imported
 * from library source (src/) but NOT from test harness (__tests__/).
 *
 * Catches the bug class: "works in Node test env, crashes in browser/RN prod."
 */
import type { Plugin } from "vite";

/**
 * Strict list: modules that must NEVER appear in browser/RN code paths.
 * Start narrow (ws, better-sqlite3, node builtins used in storage/transport)
 * and widen as Client.ts is cleaned up.
 *
 * Known pre-existing violations in master Client.ts (not yet poisoned):
 *   chalk, winston, events, browser-or-node, btoa, node:os, node:perf_hooks
 * These will be addressed when the full adapter migration lands.
 */
/**
 * ALL Node-only modules that must not appear in browser/RN code paths.
 * Browser test won't pass until Client.ts is fully decoupled from Node.
 * That's intentional — don't narrow this list to make tests green.
 */
const NODE_MODULES = [
    // Node built-in modules
    "fs",
    "node:fs",
    "crypto",
    "node:crypto",
    "path",
    "node:path",
    "os",
    "node:os",
    "net",
    "node:net",
    "http",
    "node:http",
    "https",
    "node:https",
    "stream",
    "node:stream",
    "events",
    "node:events",
    "child_process",
    "node:child_process",
    "perf_hooks",
    "node:perf_hooks",
    // Node-only npm packages
    "ws",
    "better-sqlite3",
    "knex",
    "winston",
    "chalk",
];

export function poisonNodeImports(): Plugin {
    return {
        name: "poison-node-imports",
        enforce: "pre",
        resolveId(source: string, importer?: string) {
            if (!importer) return null;
            // Only poison imports from library source, not test harness
            if (importer.includes("__tests__")) return null;
            if (importer.includes("node_modules")) return null;

            const bare = source.replace(/\.js$/, "").replace(/\.ts$/, "");
            if (NODE_MODULES.includes(bare)) {
                return `\0poisoned:${source}`;
            }
            return null;
        },
        load(id: string) {
            if (!id.startsWith("\0poisoned:")) return null;
            const mod = id.slice("\0poisoned:".length);
            return `throw new Error("[platform-guard] Node module '${mod}' imported in browser/RN context — this would crash in production.");`;
        },
    };
}
