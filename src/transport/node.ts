/**
 * Wraps the `ws` library to match the WebSocketLike interface expected by Client.
 * Used by the Node preset and the Client's built-in Node fallback.
 *
 * Buffer (from ws default nodebuffer mode) extends Uint8Array,
 * so message data is forwarded directly.
 */
import type { WebSocketCtor, WebSocketLike } from "./types.js";
import type WS from "ws";

/**
 * Create a WebSocketCtor that wraps the `ws` library to satisfy WebSocketLike.
 * Call with the already-imported `ws` default export:
 *
 *     const { default: WS } = await import("ws");
 *     const ctor = createNodeWebSocket(WS);
 */
export function createNodeWebSocket(
    WsCtor: new (url: string, options?: WS.ClientOptions) => WS,
): WebSocketCtor {
    const Ctor: WebSocketCtor = class NodeWebSocket implements WebSocketLike {
        onerror: ((err: Error | Event) => void) | null = null;
        get readyState() {
            return this.ws.readyState;
        }
        private readonly errorListeners = new Map<
            (error: Error) => void,
            (...args: unknown[]) => void
        >();
        private readonly lifecycleListeners = new Map<
            () => void,
            (...args: unknown[]) => void
        >();
        private readonly messageListeners = new Map<
            (data: Uint8Array) => void,
            (...args: unknown[]) => void
        >();

        private readonly ws: WS;

        constructor(url: string, options?: WS.ClientOptions) {
            this.ws = new WsCtor(url, options);
            this.ws.on("error", (err: Error) => this.onerror?.(err));
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
                    this.ws.off(event, wrapped);
                    this.messageListeners.delete(typedListener);
                }
            } else if (event === "error") {
                const typedListener: (error: Error) => void = listener;
                const wrapped = this.errorListeners.get(typedListener);
                if (wrapped) {
                    this.ws.off(event, wrapped);
                    this.errorListeners.delete(typedListener);
                }
            } else {
                const typedListener: () => void = listener;
                const wrapped = this.lifecycleListeners.get(typedListener);
                if (wrapped) {
                    this.ws.off(event, wrapped);
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
                const wrapped = (data: unknown) => {
                    // ws passes Buffer (extends Uint8Array) with default nodebuffer mode
                    if (data instanceof Uint8Array) {
                        typedListener(data);
                    } else if (data instanceof ArrayBuffer) {
                        typedListener(new Uint8Array(data));
                    }
                };
                this.messageListeners.set(typedListener, wrapped);
                this.ws.on(event, wrapped);
            } else if (event === "error") {
                const typedListener: (error: Error) => void = listener;
                const wrapped = (err: unknown) => {
                    typedListener(
                        err instanceof Error ? err : new Error(String(err)),
                    );
                };
                this.errorListeners.set(typedListener, wrapped);
                this.ws.on(event, wrapped);
            } else {
                // "open" | "close"
                const typedListener: () => void = listener;
                const wrapped = () => {
                    typedListener();
                };
                this.lifecycleListeners.set(typedListener, wrapped);
                this.ws.on(event, wrapped);
            }
        }

        send(data: Uint8Array) {
            this.ws.send(data);
        }

        terminate() {
            this.ws.terminate();
        }
    };
    return Ctor;
}
