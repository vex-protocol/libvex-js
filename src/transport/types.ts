export interface ILogger {
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
}

export type IWebSocketCtor = new (
    url: string,
    options?: object,
) => IWebSocketLike;

export interface IWebSocketLike {
    on(event: string, listener: (...args: any[]) => void): void;
    off(event: string, listener: (...args: any[]) => void): void;
    send(data: any): void;
    close(): void;
    terminate?(): void;
    onerror: ((err: any) => void) | null;
    readyState: number;
}

export interface IClientAdapters {
    logger: ILogger;
    WebSocket: IWebSocketCtor;
}
