export interface ClientAdapters {
    logger: Logger;
    WebSocket: WebSocketCtor;
}

export interface Logger {
    debug(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
}

export type WebSocketCtor = new (
    url: string,
    options?: object,
) => WebSocketLike;

export interface WebSocketLike {
    close(): void;
    off(event: string, listener: (...args: any[]) => void): void;
    on(event: string, listener: (...args: any[]) => void): void;
    onerror: ((err: any) => void) | null;
    readyState: number;
    send(data: any): void;
    terminate?(): void;
}
