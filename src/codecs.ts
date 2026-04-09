/**
 * Pre-built codec instances for every HTTP response type.
 *
 * Usage: import { UserCodec } from "./codecs.js";
 *        const data = decodeAxios(UserCodec, res.data);
 *
 * decode() returns typed data without runtime validation (SDK trusts server).
 * For trust boundary validation, use codec.decodeSafe() directly.
 */
import { z } from "zod/v4";

import {
    actionToken,
    channel,
    device,
    emoji,
    fileSQL,
    invite,
    keyBundle,
    permission,
    server,
    user,
} from "@vex-chat/types";

import { createCodec } from "./codec.js";

// ── Named schema codecs ─────────────────────────────────────────────────────

export const UserCodec = createCodec(user);
export const DeviceCodec = createCodec(device);
export const ServerCodec = createCodec(server);
export const ChannelCodec = createCodec(channel);
export const PermissionCodec = createCodec(permission);
export const InviteCodec = createCodec(invite);
export const EmojiCodec = createCodec(emoji);
export const FileSQLCodec = createCodec(fileSQL);
export const ActionTokenCodec = createCodec(actionToken);
export const KeyBundleCodec = createCodec(keyBundle);

// ── Array codecs ────────────────────────────────────────────────────────────

export const UserArrayCodec = createCodec(z.array(user));
export const DeviceArrayCodec = createCodec(z.array(device));
export const ServerArrayCodec = createCodec(z.array(server));
export const ChannelArrayCodec = createCodec(z.array(channel));
export const PermissionArrayCodec = createCodec(z.array(permission));
export const InviteArrayCodec = createCodec(z.array(invite));
export const EmojiArrayCodec = createCodec(z.array(emoji));

// ── Inline ad-hoc response codecs ───────────────────────────────────────────

export const ConnectResponseCodec = createCodec(
    z.object({ deviceToken: z.string() }),
);

export const AuthResponseCodec = createCodec(
    z.object({
        token: z.string(),
        user,
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
        user,
    }),
);

export const OtkCountCodec = createCodec(
    z.object({ count: z.number() }),
);

// ── Helper: decode axios response buffer ────────────────────────────────────

/**
 * Decode an axios arraybuffer response with a typed codec.
 * Uses decode (typed but not validated) — SDK trusts its own server.
 * For trust boundary validation (Spire), use decodeSafe() directly.
 */
export function decodeAxios<T>(
    codec: { decode: (data: Uint8Array) => T },
    data: ArrayBuffer,
): T {
    return codec.decode(new Uint8Array(data));
}
