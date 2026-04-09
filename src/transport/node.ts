/**
 * Wraps the `ws` library to match the WebSocketLike interface expected by Client.
 * Used by the Node preset and the Client's built-in Node fallback.
 *
 * Buffer (from ws default nodebuffer mode) extends Uint8Array,
 * so message data is forwarded directly.
 */
import type { WebSocketCtor, WebSocketLike } from "./types.js";
import type WS from "ws";

type AnyListener = (...args: never[]) => void;

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
    /* eslint-disable @typescript-eslint/no-unsafe-type-assertion --
       Event-dispatch narrowing and WS.ClientOptions cast are safe
       (we control the call sites; object ⊂ ClientOptions at runtime). */
    return class NodeWebSocket implements WebSocketLike {
        onerror: ((err: Error | Event) => void) | null = null;
        get readyState() {
            return this.ws.readyState;
        }
        private readonly wrappedListeners = new Map<
            AnyListener,
            (...args: unknown[]) => void
        >();

        private readonly ws: WS;

        constructor(url: string, options?: object) {
            this.ws = new WsCtor(url, options as WS.ClientOptions);
            this.ws.on("error", (err: Error) => this.onerror?.(err));
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
                this.ws.off(event, wrapped);
                this.wrappedListeners.delete(listener);
            }
        }

        on(event: "close" | "open", listener: () => void): void;
        on(event: "error", listener: (error: Error) => void): void;
        on(event: "message", listener: (data: Uint8Array) => void): void;
        on(event: string, listener: AnyListener): void {
            let wrapped: (...args: unknown[]) => void;

            if (event === "message") {
                // ws passes Buffer (extends Uint8Array) with default nodebuffer mode
                wrapped = (data: unknown) => {
                    (listener as unknown as (data: Uint8Array) => void)(
                        data instanceof Uint8Array
                            ? data
                            : new Uint8Array(data as ArrayBuffer),
                    );
                };
            } else if (event === "error") {
                wrapped = (err: unknown) => {
                    (listener as unknown as (error: Error) => void)(
                        err instanceof Error ? err : new Error(String(err)),
                    );
                };
            } else {
                // "open" | "close"
                wrapped = () => {
                    (listener as unknown as () => void)();
                };
            }

            this.wrappedListeners.set(listener, wrapped);
            this.ws.on(event, wrapped);
        }

        send(data: Uint8Array) {
            this.ws.send(data);
        }

        terminate() {
            this.ws.terminate();
        }
    } as WebSocketCtor;
    /* eslint-enable @typescript-eslint/no-unsafe-type-assertion */
}
