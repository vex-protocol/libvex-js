/**
 * Platform-simulating WebSocket constructors for integration tests.
 * Node delivers Buffer; browsers/RN deliver Uint8Array.
 */

import type {
    IClientAdapters,
    ILogger,
    IWebSocketLike,
} from "../../transport/types.js";

import WebSocket from "ws";

const testLogger: ILogger = {
    debug(_m: string) {},
    error(m: string) {
        console.error(`[test] ${m}`);
    },
    info(m: string) {
        console.log(`[test] ${m}`);
    },
    warn(m: string) {
        console.warn(`[test] ${m}`);
    },
};

// ─── Node: raw ws, delivers Buffer ──────────────────────────────────────────

class BrowserTestWS implements IWebSocketLike {
    onerror: ((err: any) => void) | null = null;
    get readyState() {
        return this.ws.readyState;
    }
    private readonly messageListeners = new Map<Function, (...args: any[]) => void>();

    private readonly ws: WebSocket;

    constructor(url: string, _options?: object) {
        this.ws = new WebSocket(url);
        this.ws.onerror = (ev) => this.onerror?.(ev);
    }
    close() {
        this.ws.close();
    }
    off(event: string, listener: (...args: any[]) => void) {
        if (event === "message") {
            const wrapped = this.messageListeners.get(listener);
            if (wrapped) {
                this.ws.off("message", wrapped);
                this.messageListeners.delete(listener);
            }
        } else {
            this.ws.off(event, listener);
        }
    }
    on(event: string, listener: (...args: any[]) => void) {
        if (event === "message") {
            const wrapped = (data: Buffer) => { listener(new Uint8Array(data)); };
            this.messageListeners.set(listener, wrapped);
            this.ws.on("message", wrapped);
        } else {
            this.ws.on(event, listener);
        }
    }
    send(data: any) {
        this.ws.send(data);
    }
    terminate() {
        this.ws.terminate();
    }
}

// ─── Browser/Tauri/RN: delivers Uint8Array (simulates browser binary) ───────

class NodeTestWS implements IWebSocketLike {
    onerror: ((err: any) => void) | null = null;
    get readyState() {
        return this.ws.readyState;
    }

    private readonly ws: WebSocket;

    constructor(url: string, _options?: any) {
        this.ws = new WebSocket(url);
        this.ws.onerror = (ev) => this.onerror?.(ev);
    }
    close() {
        this.ws.close();
    }
    off(event: string, listener: (...args: any[]) => void) {
        this.ws.off(event, listener);
    }
    on(event: string, listener: (...args: any[]) => void) {
        this.ws.on(event, listener);
    }
    send(data: any) {
        this.ws.send(data);
    }
    terminate() {
        this.ws.terminate();
    }
}

// ─── Adapter factories ───────────────────────────────────────────────────────

export function browserTestAdapters(): IClientAdapters {
    return { logger: testLogger, WebSocket: BrowserTestWS as any };
}

export function nodeTestAdapters(): IClientAdapters {
    return { logger: testLogger, WebSocket: NodeTestWS as any };
}
