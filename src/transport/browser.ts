/**
 * Wraps the browser's native WebSocket to match the WebSocketLike interface
 * expected by Client. Used by Tauri (webview) and future web builds.
 */
import type { WebSocketLike } from "./types.js";

export class BrowserWebSocket implements WebSocketLike {
    onerror: ((err: Error | Event) => void) | null = null;
    get readyState() {
        return this.ws.readyState;
    }
    private readonly errorListeners = new Map<
        (error: Error) => void,
        EventListener
    >();
    private readonly lifecycleListeners = new Map<() => void, EventListener>();
    private readonly messageListeners = new Map<
        (data: Uint8Array) => void,
        EventListener
    >();

    private readonly ws: WebSocket;

    constructor(url: string, _options?: object) {
        this.ws = new globalThis.WebSocket(url);
        this.ws.binaryType = "arraybuffer";
        this.ws.onerror = (ev) => this.onerror?.(ev);
    }

    close() {
        this.ws.close();
    }

    off(event: "close" | "open", listener: () => void): void;
    off(event: "error", listener: (error: Error) => void): void;
    off(event: "message", listener: (data: Uint8Array) => void): void;
    off(event: string, listener: never): void {
        if (event === "message") {
            const typedListener: (data: Uint8Array) => void = listener;
            const wrapped = this.messageListeners.get(typedListener);
            if (wrapped) {
                this.ws.removeEventListener(event, wrapped);
                this.messageListeners.delete(typedListener);
            }
        } else if (event === "error") {
            const typedListener: (error: Error) => void = listener;
            const wrapped = this.errorListeners.get(typedListener);
            if (wrapped) {
                this.ws.removeEventListener(event, wrapped);
                this.errorListeners.delete(typedListener);
            }
        } else {
            const typedListener: () => void = listener;
            const wrapped = this.lifecycleListeners.get(typedListener);
            if (wrapped) {
                this.ws.removeEventListener(event, wrapped);
                this.lifecycleListeners.delete(typedListener);
            }
        }
    }

    on(event: "close" | "open", listener: () => void): void;
    on(event: "error", listener: (error: Error) => void): void;
    on(event: "message", listener: (data: Uint8Array) => void): void;
    on(event: string, listener: never): void {
        if (event === "message") {
            const typedListener: (data: Uint8Array) => void = listener;
            const wrapped: EventListener = (ev: Event) => {
                // Browser WebSocket wraps binary data in MessageEvent
                if (
                    ev instanceof MessageEvent &&
                    ev.data instanceof ArrayBuffer
                ) {
                    typedListener(new Uint8Array(ev.data));
                }
            };
            this.messageListeners.set(typedListener, wrapped);
            this.ws.addEventListener(event, wrapped);
        } else if (event === "error") {
            const typedListener: (error: Error) => void = listener;
            const wrapped: EventListener = (ev: Event) => {
                typedListener(
                    ev instanceof Error ? ev : new Error("WebSocket error"),
                );
            };
            this.errorListeners.set(typedListener, wrapped);
            this.ws.addEventListener(event, wrapped);
        } else {
            // "open" | "close"
            const typedListener: () => void = listener;
            const wrapped: EventListener = () => {
                typedListener();
            };
            this.lifecycleListeners.set(typedListener, wrapped);
            this.ws.addEventListener(event, wrapped);
        }
    }

    send(data: Uint8Array) {
        // DOM WebSocket.send() requires Uint8Array<ArrayBuffer> (not SharedArrayBuffer).
        // Copy into a fresh ArrayBuffer-backed Uint8Array to satisfy the type constraint.
        this.ws.send(new Uint8Array(data));
    }

    terminate() {
        this.ws.close();
    }
}
