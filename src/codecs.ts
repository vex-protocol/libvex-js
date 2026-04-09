/**
 * Pre-built codec instances for every HTTP response type.
 *
 * Usage: import { UserCodec } from "./codecs.js";
 *        const data = decodeAxios(UserCodec, res.data);
 *
 * decode() returns typed data without runtime validation (SDK trusts server).
 * For trust boundary validation, use codec.decodeSafe() directly.
 */
import {
    ActionTokenSchema,
    ChannelSchema,
    DeviceSchema,
    EmojiSchema,
    FileSQLSchema,
    InviteSchema,
    KeyBundleSchema,
    PermissionSchema,
    ServerSchema,
    UserSchema,
} from "@vex-chat/types";

import { z } from "zod/v4";

import { createCodec } from "./codec.js";

// ── Named schema codecs ─────────────────────────────────────────────────────

export const UserCodec = createCodec(UserSchema);
export const DeviceCodec = createCodec(DeviceSchema);
export const ServerCodec = createCodec(ServerSchema);
export const ChannelCodec = createCodec(ChannelSchema);
export const PermissionCodec = createCodec(PermissionSchema);
export const InviteCodec = createCodec(InviteSchema);
export const EmojiCodec = createCodec(EmojiSchema);
export const FileSQLCodec = createCodec(FileSQLSchema);
export const ActionTokenCodec = createCodec(ActionTokenSchema);
export const KeyBundleCodec = createCodec(KeyBundleSchema);

// ── Array codecs ────────────────────────────────────────────────────────────

export const UserArrayCodec = createCodec(z.array(UserSchema));
export const DeviceArrayCodec = createCodec(z.array(DeviceSchema));
export const ServerArrayCodec = createCodec(z.array(ServerSchema));
export const ChannelArrayCodec = createCodec(z.array(ChannelSchema));
export const PermissionArrayCodec = createCodec(z.array(PermissionSchema));
export const InviteArrayCodec = createCodec(z.array(InviteSchema));
export const EmojiArrayCodec = createCodec(z.array(EmojiSchema));

// ── Inline ad-hoc response codecs ───────────────────────────────────────────

export const ConnectResponseCodec = createCodec(
    z.object({ deviceToken: z.string() }),
);

export const AuthResponseCodec = createCodec(
    z.object({
        token: z.string(),
        user: UserSchema,
    }),
);

export const DeviceChallengeCodec = createCodec(
    z.object({
        challenge: z.string(),
        challengeID: z.string(),
    }),
);

export const WhoamiCodec = createCodec(
    z.object({
        exp: z.number(),
        token: z.string(),
        user: UserSchema,
    }),
);

export const OtkCountCodec = createCodec(z.object({ count: z.number() }));

// ── Helper: decode axios response buffer ────────────────────────────────────

/**
 * Decode an axios arraybuffer response with a typed codec.
 * Uses decodeSafe (Zod-validated) so schema mismatches surface immediately.
 */
export function decodeAxios<T>(
    codec: { decodeSafe: (data: Uint8Array) => T },
    /**
     * Accepts `unknown` because axios types its `responseType: 'arraybuffer'`
     * responses as `any`. At runtime this is always an `ArrayBuffer`.
     */
    data: unknown,
): T {
    // Node: axios returns Buffer (extends Uint8Array). Browser: ArrayBuffer.
    if (data instanceof Uint8Array) {
        return codec.decodeSafe(data);
    }
    if (data instanceof ArrayBuffer) {
        return codec.decodeSafe(new Uint8Array(data));
    }
    throw new Error("Expected ArrayBuffer or Buffer from axios response");
}
