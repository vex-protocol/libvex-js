// Upstream doesn't ship types; declare minimal surface used in src.
declare module "@extrahash/sleep" {
    export function sleep(ms: number): Promise<void>;
}
