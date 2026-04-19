/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Plugin } from "vite";

/**
 * Vite plugin that catches Node builtin imports AND Node-only globals
 * in library source (src/) during transformation.
 *
 * Vitest runs in Node where builtins resolve natively and globals like
 * Buffer/process exist — so tests pass even when the code would crash
 * in a browser or Tauri webview. This plugin catches those at transform
 * time, which vitest does invoke.
 *
 * Uses Node's own builtinModules list — no manual maintenance needed.
 */
import { builtinModules } from "node:module";

const nodeBuiltins = new Set([
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
]);

// Node-only globals that don't exist in browsers/Tauri/RN.
// \bBuffer\b won't match ArrayBuffer or SharedArrayBuffer (no word boundary).
const NODE_GLOBALS = ["Buffer", "process", "__dirname", "__filename"];

// Matches: import ... from "events"  or  import ... from 'node:os'
// Also: export ... from "events"
const IMPORT_RE = /(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
// Matches: await import("events")
const DYNAMIC_IMPORT_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

type Violation = { kind: "global" | "import"; line: number; name: string };

export function poisonNodeImports(): Plugin {
    return {
        enforce: "pre",
        name: "poison-node-imports",
        transform(code: string, id: string) {
            // Only check library source — not tests or dependencies
            if (!id.includes("/src/")) return null;
            if (id.includes("__tests__")) return null;
            if (id.includes("node_modules")) return null;
            if (isNodeOnlyFile(id)) return null;

            const violations = findViolations(code);
            if (violations.length === 0) return null;

            const file = id.replace(/^.*\/src\//, "src/");
            const msgs = violations
                .map((v) => `  line ${String(v.line)}: ${v.name} (${v.kind})`)
                .join("\n");
            throw new Error(
                `[platform-guard] Node-only code in ${file}:\n${msgs}\n` +
                    `These would crash in browser/RN/Tauri. Use browser-safe alternatives or dynamic imports.`,
            );
        },
    };
}

function findViolations(code: string): Violation[] {
    const results: Violation[] = [];
    const lines = code.split("\n");
    const strippedLines = stripComments(code).split("\n");

    // Check imports against the original code (comments don't affect import syntax)
    for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE]) {
            re.lastIndex = 0;
            let match;
            while ((match = re.exec(lineText ?? "")) !== null) {
                const mod = match[1]?.replace(/\.js$/, "").replace(/\.ts$/, "");
                if (mod !== undefined && nodeBuiltins.has(mod)) {
                    results.push({
                        kind: "import",
                        line: i + 1,
                        name: match[1] ?? "",
                    });
                }
            }
        }
    }

    // Check globals against comment-stripped code
    for (let i = 0; i < strippedLines.length; i++) {
        const lineText = strippedLines[i] ?? "";
        for (const g of NODE_GLOBALS) {
            const re = new RegExp(`\\b${g}\\b`);
            if (re.test(lineText)) {
                results.push({ kind: "global", line: i + 1, name: g });
            }
        }
    }

    return results;
}

function isNodeOnlyFile(id: string): boolean {
    // These files are only loaded via dynamic import on the Node path.
    if (id.includes("/storage/node")) return true;
    return false;
}

/** Strip comments to avoid false positives on globals in JSDoc / inline comments. */
function stripComments(code: string): string {
    // Remove single-line comments, but not URLs (://), and multi-line comments
    return code.replace(/\/\/(?!:).*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}
