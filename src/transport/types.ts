export interface ClientAdapters {
    logger: Logger;
    WebSocket: WebSocketCtor;
}

export interface Logger {
    debug(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
}

export type WebSocketCtor = new (
    url: string,
    options?: object,
) => WebSocketLike;

export type WebSocketEvent = keyof WebSocketEventMap;

export interface WebSocketEventMap {
    close: [];
    error: [error: Error];
    message: [data: Uint8Array];
    open: [];
}

export interface WebSocketLike {
    close(): void;
    off(event: "close" | "open", listener: () => void): void;
    off(event: "error", listener: (error: Error) => void): void;
    off(event: "message", listener: (data: Uint8Array) => void): void;
    on(event: "close" | "open", listener: () => void): void;
    on(event: "error", listener: (error: Error) => void): void;
    on(event: "message", listener: (data: Uint8Array) => void): void;
    onerror: ((err: Error | Event) => void) | null;
    readyState: number;
    send(data: string | Uint8Array): void;
    terminate?(): void;
}
