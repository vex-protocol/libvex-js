/**
 * Vite plugin that makes Node builtins throw when imported
 * from library source (src/) but NOT from test harness (__tests__/).
 *
 * Catches the bug class: "works in Node test env, crashes in browser/RN prod."
 *
 * Uses Node's own builtinModules list — no manual maintenance needed.
 * Third-party npm packages are NOT poisoned; if they depend on Node
 * builtins, the bundler will fail to resolve those imports naturally.
 */
import { builtinModules } from "node:module";
import type { Plugin } from "vite";

const nodeBuiltins = new Set([
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
]);

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
            if (nodeBuiltins.has(bare)) {
                return `\0poisoned:${source}`;
            }
            return null;
        },
        load(id: string) {
            if (!id.startsWith("\0poisoned:")) return null;
            const mod = id.slice("\0poisoned:".length);
            return `throw new Error("[platform-guard] Node builtin '${mod}' imported in browser/RN context — this would crash in production.");`;
        },
    };
}
