/**
 * Wraps the browser's native WebSocket to match the WebSocketLike interface
 * expected by Client. Used by Tauri (webview) and future web builds.
 */
import type { WebSocketLike } from "./types.js";

type AnyListener = (...args: never[]) => void;

export class BrowserWebSocket implements WebSocketLike {
    onerror: ((err: Error | Event) => void) | null = null;
    get readyState() {
        return this.ws.readyState;
    }
    private readonly wrappedListeners = new Map<AnyListener, EventListener>();

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
    off(event: string, listener: AnyListener): void {
        const wrapped = this.wrappedListeners.get(listener);
        if (wrapped) {
            this.ws.removeEventListener(event, wrapped);
            this.wrappedListeners.delete(listener);
        }
    }

    on(event: "close" | "open", listener: () => void): void;
    on(event: "error", listener: (error: Error) => void): void;
    on(event: "message", listener: (data: Uint8Array) => void): void;
    /* eslint-disable @typescript-eslint/no-unsafe-type-assertion --
       Event-dispatch narrowing: implementation dispatches by event name,
       so casts from AnyListener to the specific handler type are safe. */
    on(event: string, listener: AnyListener): void {
        let wrapped: EventListener;

        if (event === "message") {
            wrapped = (ev: Event) => {
                // Browser WebSocket wraps binary data in MessageEvent
                if (
                    ev instanceof MessageEvent &&
                    ev.data instanceof ArrayBuffer
                ) {
                    (listener as unknown as (data: Uint8Array) => void)(
                        new Uint8Array(ev.data),
                    );
                }
            };
        } else if (event === "error") {
            wrapped = (ev: Event) => {
                (listener as unknown as (error: Error) => void)(
                    ev instanceof Error ? ev : new Error("WebSocket error"),
                );
            };
        } else {
            // "open" | "close"
            wrapped = () => {
                (listener as unknown as () => void)();
            };
        }

        this.wrappedListeners.set(listener, wrapped);
        this.ws.addEventListener(event, wrapped);
    }
    /* eslint-enable @typescript-eslint/no-unsafe-type-assertion */

    send(data: Uint8Array) {
        this.ws.send(data);
    }

    terminate() {
        this.ws.close();
    }
}
