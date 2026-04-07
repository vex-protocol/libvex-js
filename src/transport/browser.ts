/**
 * Wraps the browser's native WebSocket to match the IWebSocketLike interface
 * expected by Client. Used by Tauri (webview) and future web builds.
 */
import type { IWebSocketLike } from "./types.js";

export class BrowserWebSocket implements IWebSocketLike {
    private ws: WebSocket;
    private listeners = new Map<string, Map<Function, EventListener>>();
    onerror: ((err: any) => void) | null = null;

    constructor(url: string, _options?: object) {
        this.ws = new globalThis.WebSocket(url);
        this.ws.binaryType = "arraybuffer";
        this.ws.onerror = (ev) => this.onerror?.(ev);
    }

    get readyState() {
        return this.ws.readyState;
    }

    on(event: string, listener: (...args: any[]) => void) {
        let wrapped: EventListener;

        if (event === "message") {
            // Browser WebSocket wraps data in MessageEvent — unwrap to Uint8Array
            wrapped = (ev: Event) => {
                const data = (ev as MessageEvent).data;
                if (data instanceof ArrayBuffer) {
                    listener(new Uint8Array(data));
                } else {
                    listener(data);
                }
            };
        } else if (event === "open" || event === "close" || event === "error") {
            wrapped = () => listener();
        } else {
            wrapped = (ev: Event) => listener(ev);
        }

        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Map());
        }
        this.listeners.get(event)!.set(listener, wrapped);
        this.ws.addEventListener(event, wrapped);
    }

    off(event: string, listener: (...args: any[]) => void) {
        const wrapped = this.listeners.get(event)?.get(listener);
        if (wrapped) {
            this.ws.removeEventListener(event, wrapped);
            this.listeners.get(event)!.delete(listener);
        }
    }

    send(data: any) {
        this.ws.send(data);
    }

    close() {
        this.ws.close();
    }

    terminate() {
        this.ws.close();
    }
}
