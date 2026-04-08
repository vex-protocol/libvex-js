import fc from "fast-check";
/**
 * Property-based round-trip tests for msgpack codec.
 *
 * Generates random valid messages matching our wire types and verifies
 * they survive encode → decode through msgpack without data loss.
 *
 * Only uses msgpack-safe types: strings, numbers, booleans, null,
 * Uint8Array, arrays, plain objects. No Date, undefined, Map, Set.
 */
import { describe, expect, it } from "vitest";

import { msgpack } from "../codec.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const hex = (len: number) => fc.stringMatching(new RegExp(`^[0-9a-f]{${len}}$`));
const hexVar = (min: number, max: number) =>
    fc.stringMatching(new RegExp(`^[0-9a-f]{${min},${max}}$`));
const rec = <T extends Record<string, fc.Arbitrary<unknown>>>(arbs: T) =>
    fc.record(arbs, { noNullPrototype: true });

// ── Arbitraries ──────────────────────────────────────────────────────────────

const arbBaseMsg = rec({
    transmissionID: fc.uuid({ version: 4 }),
    type: fc.string({ maxLength: 32, minLength: 1 }),
});

const arbSuccessMsg = rec({
    data: fc.jsonValue(),
    timestamp: fc.option(fc.string(), { nil: null }),
    transmissionID: fc.uuid({ version: 4 }),
    type: fc.constant("success"),
});

const arbErrMsg = rec({
    data: fc.option(fc.jsonValue(), { nil: null }),
    error: fc.string({ minLength: 1 }),
    transmissionID: fc.uuid({ version: 4 }),
    type: fc.constant("error"),
});

const arbResourceMsg = rec({
    action: fc.constantFrom("CREATE", "RETRIEVE", "UPDATE", "DELETE"),
    data: fc.option(fc.jsonValue(), { nil: null }),
    resourceType: fc.constantFrom("mail", "preKeys", "otk"),
    transmissionID: fc.uuid({ version: 4 }),
    type: fc.constant("resource"),
});

const arbNotifyMsg = rec({
    data: fc.option(fc.jsonValue(), { nil: null }),
    event: fc.constantFrom("mail", "serverChange", "permission"),
    transmissionID: fc.uuid({ version: 4 }),
    type: fc.constant("notify"),
});

const arbMailSQL = rec({
    authorID: fc.uuid({ version: 4 }),
    cipher: hexVar(2, 64),
    extra: hexVar(2, 64),
    forward: fc.boolean(),
    group: fc.option(fc.uuid({ version: 4 }), { nil: null }),
    header: hex(64),
    mailID: fc.uuid({ version: 4 }),
    mailType: fc.constantFrom(0, 1),
    nonce: hex(48),
    readerID: fc.uuid({ version: 4 }),
    recipient: fc.uuid({ version: 4 }),
    sender: fc.uuid({ version: 4 }),
    time: fc.string({ maxLength: 30, minLength: 10 }),
});

const arbServer = rec({
    icon: fc.option(fc.uuid({ version: 4 }), { nil: null }),
    name: fc.string({ maxLength: 64, minLength: 1 }),
    serverID: fc.uuid({ version: 4 }),
});

const arbChannel = rec({
    channelID: fc.uuid({ version: 4 }),
    name: fc.string({ maxLength: 64, minLength: 1 }),
    serverID: fc.uuid({ version: 4 }),
});

const arbPermission = rec({
    permissionID: fc.uuid({ version: 4 }),
    powerLevel: fc.integer({ max: 100, min: 0 }),
    resourceID: fc.uuid({ version: 4 }),
    resourceType: fc.constant("server"),
    userID: fc.uuid({ version: 4 }),
});

const arbDevice = rec({
    deleted: fc.boolean(),
    deviceID: fc.uuid({ version: 4 }),
    lastLogin: fc.string({ maxLength: 30, minLength: 10 }),
    name: fc.string({ maxLength: 32, minLength: 1 }),
    owner: fc.uuid({ version: 4 }),
    signKey: hex(64),
});

const arbMailWS = rec({
    authorID: fc.uuid({ version: 4 }),
    cipher: fc.uint8Array({ maxLength: 128, minLength: 1 }),
    extra: fc.uint8Array({ maxLength: 64 }),
    forward: fc.boolean(),
    group: fc.option(fc.uint8Array({ maxLength: 16, minLength: 16 }), {
        nil: null,
    }),
    mailID: fc.uuid({ version: 4 }),
    mailType: fc.constantFrom(0, 1),
    nonce: fc.uint8Array({ maxLength: 24, minLength: 24 }),
    readerID: fc.uuid({ version: 4 }),
    recipient: fc.uuid({ version: 4 }),
    sender: fc.uuid({ version: 4 }),
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("msgpack round-trip", () => {
    const opts = { numRuns: 200 };

    it("baseMsg", () => {
        fc.assert(fc.property(arbBaseMsg, (msg) => {
            expect(msgpack.decode(msgpack.encode(msg))).toEqual(msg);
        }), opts);
    });

    it("successMsg", () => {
        fc.assert(fc.property(arbSuccessMsg, (msg) => {
            expect(msgpack.decode(msgpack.encode(msg))).toEqual(msg);
        }), opts);
    });

    it("errMsg", () => {
        fc.assert(fc.property(arbErrMsg, (msg) => {
            expect(msgpack.decode(msgpack.encode(msg))).toEqual(msg);
        }), opts);
    });

    it("resourceMsg", () => {
        fc.assert(fc.property(arbResourceMsg, (msg) => {
            expect(msgpack.decode(msgpack.encode(msg))).toEqual(msg);
        }), opts);
    });

    it("notifyMsg", () => {
        fc.assert(fc.property(arbNotifyMsg, (msg) => {
            expect(msgpack.decode(msgpack.encode(msg))).toEqual(msg);
        }), opts);
    });

    it("mailSQL (string fields)", () => {
        fc.assert(fc.property(arbMailSQL, (msg) => {
            expect(msgpack.decode(msgpack.encode(msg))).toEqual(msg);
        }), opts);
    });

    it("mailWS (binary fields)", () => {
        fc.assert(fc.property(arbMailWS, (msg) => {
            const decoded = msgpack.decode(msgpack.encode(msg));
            // Uint8Array round-trips through msgpack as Buffer — compare contents
            for (const key of Object.keys(msg) as (keyof typeof msg)[]) {
                const orig = msg[key];
                const dec = (decoded as Record<string, unknown>)[key];
                if (orig instanceof Uint8Array) {
                    expect(new Uint8Array(dec as ArrayBuffer)).toEqual(orig);
                } else {
                    expect(dec).toEqual(orig);
                }
            }
        }), opts);
    });

    it("server", () => {
        fc.assert(fc.property(arbServer, (msg) => {
            expect(msgpack.decode(msgpack.encode(msg))).toEqual(msg);
        }), opts);
    });

    it("channel", () => {
        fc.assert(fc.property(arbChannel, (msg) => {
            expect(msgpack.decode(msgpack.encode(msg))).toEqual(msg);
        }), opts);
    });

    it("permission", () => {
        fc.assert(fc.property(arbPermission, (msg) => {
            expect(msgpack.decode(msgpack.encode(msg))).toEqual(msg);
        }), opts);
    });

    it("device", () => {
        fc.assert(fc.property(arbDevice, (msg) => {
            expect(msgpack.decode(msgpack.encode(msg))).toEqual(msg);
        }), opts);
    });
});
