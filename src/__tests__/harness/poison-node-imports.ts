/**
 * Vite plugin that makes Node builtins throw when imported
 * from library source (src/) but NOT from test harness (__tests__/).
 *
 * Also replaces bare `process` global references with a throwing proxy
 * so code that reads `process.env` or `process.platform` fails fast
 * instead of silently producing `undefined`.
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

const PROCESS_SHIM = `\
const __poisonedProcess = new Proxy({}, {
    get(_, prop) {
        throw new Error("[platform-guard] process." + String(prop) + " accessed in browser/RN context — this would crash in production.");
    }
});
`;

export function poisonNodeImports(): Plugin {
    return {
        name: "poison-node-imports",
        enforce: "pre",
        resolveId(source: string, importer?: string) {
            if (!importer) return null;
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
        transform(code: string, id: string) {
            // Only transform library source, not tests or deps
            if (
                !id.includes("/src/") ||
                id.includes("__tests__") ||
                id.includes("node_modules")
            )
                return null;
            // Skip files that don't reference process
            if (!code.includes("process")) return null;

            // Inject shim and replace bare `process` references.
            // Use word boundary to avoid replacing "processing", "preprocessor", etc.
            const transformed = code.replace(
                /\bprocess\b/g,
                "__poisonedProcess",
            );
            if (transformed === code) return null;
            return { code: PROCESS_SHIM + transformed, map: null };
        },
    };
}
