export interface IClientAdapters {
    logger: ILogger;
    WebSocket: IWebSocketCtor;
}

export interface ILogger {
    debug(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
}

export type IWebSocketCtor = new (
    url: string,
    options?: object,
) => IWebSocketLike;

export interface IWebSocketLike {
    close(): void;
    off(event: string, listener: (...args: any[]) => void): void;
    on(event: string, listener: (...args: any[]) => void): void;
    onerror: ((err: any) => void) | null;
    readyState: number;
    send(data: any): void;
    terminate?(): void;
}
