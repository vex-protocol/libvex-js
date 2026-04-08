/**
 * Platform-simulating WebSocket constructors for integration tests.
 * Node delivers Buffer; browsers/RN deliver Uint8Array.
 */

import WebSocket from "ws";
import type {
    IClientAdapters,
    ILogger,
    IWebSocketLike,
} from "../../transport/types.js";

const testLogger: ILogger = {
    info(m: string) {
        console.log(`[test] ${m}`);
    },
    warn(m: string) {
        console.warn(`[test] ${m}`);
    },
    error(m: string) {
        console.error(`[test] ${m}`);
    },
    debug(_m: string) {},
};

// ─── Node: raw ws, delivers Buffer ──────────────────────────────────────────

class NodeTestWS implements IWebSocketLike {
    private ws: WebSocket;
    onerror: ((err: any) => void) | null = null;

    constructor(url: string, _options?: any) {
        this.ws = new WebSocket(url);
        this.ws.onerror = (ev) => this.onerror?.(ev);
    }

    get readyState() {
        return this.ws.readyState;
    }
    on(event: string, listener: (...args: any[]) => void) {
        this.ws.on(event, listener);
    }
    off(event: string, listener: (...args: any[]) => void) {
        this.ws.off(event, listener);
    }
    send(data: any) {
        this.ws.send(data);
    }
    close() {
        this.ws.close();
    }
    terminate() {
        this.ws.terminate();
    }
}

// ─── Browser/Tauri/RN: delivers Uint8Array (simulates browser binary) ───────

class BrowserTestWS implements IWebSocketLike {
    private ws: WebSocket;
    onerror: ((err: any) => void) | null = null;

    constructor(url: string, _options?: object) {
        this.ws = new WebSocket(url);
        this.ws.onerror = (ev) => this.onerror?.(ev);
    }

    get readyState() {
        return this.ws.readyState;
    }
    on(event: string, listener: (...args: any[]) => void) {
        if (event === "message") {
            this.ws.on("message", (data: Buffer) =>
                listener(new Uint8Array(data)),
            );
        } else {
            this.ws.on(event, listener);
        }
    }
    off(event: string, listener: (...args: any[]) => void) {
        this.ws.off(event, listener);
    }
    send(data: any) {
        this.ws.send(data);
    }
    close() {
        this.ws.close();
    }
    terminate() {
        this.ws.terminate();
    }
}

// ─── Adapter factories ───────────────────────────────────────────────────────

export function nodeTestAdapters(): IClientAdapters {
    return { logger: testLogger, WebSocket: NodeTestWS as any };
}

export function browserTestAdapters(): IClientAdapters {
    return { logger: testLogger, WebSocket: BrowserTestWS as any };
}
