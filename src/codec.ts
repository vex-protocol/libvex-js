/**
 * Type-safe codec factory for msgpack encode/decode with optional Zod validation.
 *
 * Usage:
 *   import { mailWS } from "@vex-chat/types";
 *   const MailCodec = createCodec(mailWS);
 *
 *   // SDK/Apps (trusted internal) — fast, typed, no Zod overhead:
 *   const msg = MailCodec.decode(data);
 *
 *   // Spire (trust boundary) — validates at runtime:
 *   const msg = MailCodec.decodeSafe(data);
 */

import type { z } from "zod/v4";

import { Packr } from "msgpackr";

const _packr = new Packr({ moreTypes: false, useRecords: false });

/**
 * Creates a type-safe codec for msgpack encode/decode.
 *
 * @param schema - A Zod schema to validate against
 * @returns An object with encode, decode, encodeSafe, and decodeSafe methods
 */
export function createCodec<T extends z.ZodType>(schema: T) {
    type Msg = z.infer<T>;
    return {
        /** Decode msgpack data — typed but not validated. Fast path for SDK. */
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- intentional: fast path trusts server
        decode: (data: Uint8Array): Msg => decode(data) as Msg,

        /** Decode + validate with Zod. Safe path for trust boundaries (Spire). */
        decodeSafe: (data: Uint8Array): Msg =>
            schema.parse(decode(data)) as Msg,

        /** Encode to msgpack — typed but not validated. */
        encode: (msg: Msg): Uint8Array => encode(msg),

        /** Validate + encode. Ensures outgoing messages match the schema. */
        encodeSafe: (msg: Msg): Uint8Array => {
            schema.parse(msg);
            return encode(msg);
        },
    };
}

function decode(data: Uint8Array): unknown {
    return _packr.decode(data) as unknown;
}

/**
 * Encode a value to msgpack. Returns a fresh Uint8Array copy
 * (not a subarray of the internal pool buffer) to avoid browser
 * XMLHttpRequest.send() corruption (axios issue #4068).
 */
function encode(value: unknown): Uint8Array {
    const packed = _packr.encode(value);
    return new Uint8Array(
        packed.buffer.slice(
            packed.byteOffset,
            packed.byteOffset + packed.byteLength,
        ),
    );
}

/** Raw msgpack encode/decode without schema validation. */
export const msgpack = { decode, encode };
