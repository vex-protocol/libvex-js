/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

/**
 * Type-safe codec factory for msgpack encode/decode with optional Zod validation.
 *
 * Usage:
 *   import { MailWSSchema } from "@vex-chat/types";
 *   const MailCodec = createCodec(MailWSSchema);
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
        /** Decode msgpack data and validate against the schema. */
        decode: (data: Uint8Array): Msg =>
            schema.parse(msgpackDecode(data)) as Msg,

        /** Alias for decode — both paths validate. Kept for API compat. */
        decodeSafe: (data: Uint8Array): Msg =>
            schema.parse(msgpackDecode(data)) as Msg,

        /** Encode to msgpack. */
        encode: (msg: Msg): Uint8Array => msgpackEncode(msg),

        /** Validate against the schema, then encode to msgpack. */
        encodeSafe: (msg: Msg): Uint8Array => {
            schema.parse(msg);
            return msgpackEncode(msg);
        },
    };
}

function msgpackDecode(data: Uint8Array): unknown {
    return _packr.decode(data) as unknown;
}

/**
 * Encode a value to msgpack. Returns a fresh Uint8Array copy
 * (not a subarray of the internal pool buffer) to avoid browser
 * XMLHttpRequest.send() corruption (axios issue #4068).
 */
function msgpackEncode(value: unknown): Uint8Array {
    const packed = _packr.encode(value);
    return new Uint8Array(
        packed.buffer.slice(
            packed.byteOffset,
            packed.byteOffset + packed.byteLength,
        ),
    );
}

/**
 * Raw msgpack encode/decode without schema validation.
 * (Wrappers avoid API Extractor ae-forgotten-export on internal helpers.)
 */
export const msgpack = {
    decode: (data: Uint8Array): unknown => msgpackDecode(data),
    encode: (value: unknown): Uint8Array => msgpackEncode(value),
};
