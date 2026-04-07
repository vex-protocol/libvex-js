/**
 * Vite plugin that catches Node builtin imports from library source (src/)
 * during transformation — which vitest actually invokes, unlike resolveId
 * which gets bypassed in Node's module system.
 *
 * Catches the bug class: "works in Node test env, crashes in browser/RN prod."
 *
 * Uses Node's own builtinModules list — no manual maintenance needed.
 */
import { builtinModules } from "node:module";
import type { Plugin } from "vite";

const nodeBuiltins = new Set([
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
]);

// Matches: import ... from "events"  or  import ... from 'node:os'
// Also: export ... from "events"
const IMPORT_RE = /(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
// Matches: await import("events")
const DYNAMIC_IMPORT_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

function findBannedImports(code: string): { mod: string; line: number }[] {
    const results: { mod: string; line: number }[] = [];
    const lines = code.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE]) {
            re.lastIndex = 0;
            let match;
            while ((match = re.exec(lineText)) !== null) {
                const mod = match[1].replace(/\.js$/, "").replace(/\.ts$/, "");
                if (nodeBuiltins.has(mod)) {
                    results.push({ mod: match[1], line: i + 1 });
                }
            }
        }
    }
    return results;
}

export function poisonNodeImports(): Plugin {
    return {
        name: "poison-node-imports",
        enforce: "pre",
        transform(code: string, id: string) {
            // Only check library source — not tests or dependencies
            if (!id.includes("/src/")) return null;
            if (id.includes("__tests__")) return null;
            if (id.includes("node_modules")) return null;
            // Node-only modules that are only loaded via dynamic import
            if (id.endsWith("/Storage.ts") || id.endsWith("/Storage.js"))
                return null;
            if (id.includes("/utils/createLogger")) return null;

            const banned = findBannedImports(code);
            if (banned.length === 0) return null;

            const file = id.replace(/^.*\/src\//, "src/");
            const msgs = banned
                .map((b) => `  line ${b.line}: ${b.mod}`)
                .join("\n");
            throw new Error(
                `[platform-guard] Node builtins imported in ${file}:\n${msgs}\n` +
                    `These would crash in browser/RN. Use adapters or dynamic imports on the Node-only path.`,
            );
        },
    };
}
