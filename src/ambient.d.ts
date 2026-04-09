// Upstream doesn't ship types; declare minimal surface used in src.
declare module "@extrahash/sleep" {
    export function sleep(ms: number): Promise<void>;
}

// kysely-expo ships types but they conflict with Kysely's ESM build
// (CJS #private field mismatch). Declare as implementing Dialect.
declare module "kysely-expo" {
    import type { Dialect } from "kysely";
    export class ExpoDialect implements Dialect {
        createAdapter: Dialect["createAdapter"];
        createDriver: Dialect["createDriver"];
        createIntrospector: Dialect["createIntrospector"];
        createQueryCompiler: Dialect["createQueryCompiler"];
        constructor(config: { database: string });
    }
}
