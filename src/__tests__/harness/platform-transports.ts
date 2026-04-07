/**
 * Platform-simulating WebSocket constructors for integration tests.
 *
 * All three wrap Node's `ws` (since tests run in Node), but model each
 * platform's behavior regarding cookie delivery on the HTTP upgrade request.
 *
 * - NodeTestWS:    forwards cookies via headers (Node ws API)
 * - BrowserTestWS: forwards cookies via headers (simulates shared cookie jar)
 * - RNTestWS:      strips cookies entirely (simulates iOS RN bug)
 */

import WebSocket from "ws";
import ax from "axios";
import type {
    IClientAdapters,
    ILogger,
    IWebSocketLike,
} from "../../transport/types.js";

function getAxiosCookies(): string {
    return (ax.defaults.headers as any)?.["cookie"] ?? "";
}

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

// ─── Node: direct ws, forwards cookies via headers ───────────────────────────

class NodeTestWS implements IWebSocketLike {
    private ws: WebSocket;
    onerror: ((err: any) => void) | null = null;

    constructor(url: string, options?: any) {
        // Node ws accepts { headers } — this is how the old Client.initSocket()
        // passes the auth cookie. Forward whatever the client passes through.
        const cookies = getAxiosCookies();
        const mergedHeaders = {
            ...(cookies ? { Cookie: cookies } : {}),
            ...(options?.headers ?? {}),
        };
        this.ws = new WebSocket(url, { headers: mergedHeaders });
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

// ─── Browser/Tauri: cookie jar shared, binary as Uint8Array ──────────────────

class BrowserTestWS implements IWebSocketLike {
    private ws: WebSocket;
    onerror: ((err: any) => void) | null = null;

    constructor(url: string, _options?: object) {
        // In a real browser, the cookie jar from XHR/fetch is automatically
        // attached to WebSocket upgrade requests. Simulate by reading axios cookies.
        const cookies = getAxiosCookies();
        this.ws = new WebSocket(url, {
            headers: cookies ? { Cookie: cookies } : {},
        });
        this.ws.onerror = (ev) => this.onerror?.(ev);
    }

    get readyState() {
        return this.ws.readyState;
    }
    on(event: string, listener: (...args: any[]) => void) {
        if (event === "message") {
            // Browser WebSocket delivers MessageEvent with ArrayBuffer data.
            // Real BrowserWebSocket wrapper converts to Uint8Array.
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

// ─── React Native: cookies NOT forwarded on upgrade ──────────────────────────

class RNTestWS implements IWebSocketLike {
    private ws: WebSocket;
    onerror: ((err: any) => void) | null = null;

    constructor(url: string, _options?: object) {
        // THE KEY DIFFERENCE: iOS React Native's WebSocket does not read from
        // the cookie jar. The HTTP upgrade request has no Cookie header.
        // The { headers } option from initSocket() is also ignored — real RN
        // WebSocket doesn't support it.
        this.ws = new WebSocket(url); // <── bare, no headers
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

export function rnTestAdapters(): IClientAdapters {
    return { logger: testLogger, WebSocket: RNTestWS as any };
}
