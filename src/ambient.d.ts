// Upstream doesn't ship types; declare minimal surface used in src.
declare module "@extrahash/sleep" {
    export function sleep(ms: number): Promise<void>;
}

// kysely-expo is an optional peerDependency — only available in Expo apps.
declare module "kysely-expo" {
    export class ExpoDialect {
        constructor(config: { database: string });
    }
}
