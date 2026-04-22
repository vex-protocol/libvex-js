/**
 * Reproduces the multi-device e2e setup, sends one DM, then POSTs
 * /device/:deviceID/mail for each recipient device to see whether the server
 * has pending inbox rows (msgpack array length).
 *
 * Pass Spire address via the shell/CI `process.env` (this dev script is not
 * the published `Client` API, which uses `ClientOptions` only).
 *
 * Usage (from libvex-js, after `npm run build`):
 *   API_URL=http://127.0.0.1:16777 DEV_API_KEY=... node scripts/probe-multi-device-mail.mjs
 *
 * If lengths are 0 for one device and >0 for the other, the problem is
 * server-side delivery; if both >0, the problem is client decrypt/emit.
 *
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 */
import { setCryptoProfile, xSignKeyPairFromSecret, XKeyConvert, XUtils } from "@vex-chat/crypto";
import { MemoryStorage } from "../dist/__tests__/harness/memory-storage.js";
import { Client } from "../dist/index.js";
import { msgpack } from "../dist/codec.js";

function apiUrlOverrideFromEnv() {
    const raw = process.env["API_URL"]?.trim();
    const devKey = process.env["DEV_API_KEY"]?.trim();
    if (!raw && (devKey === undefined || devKey.length === 0)) {
        return {};
    }
    const fromUrl = (s) => {
        if (/^https?:\/\//i.test(s)) {
            const u = new URL(s);
            return { host: u.host, unsafeHttp: u.protocol === "http:" };
        }
        return { host: s, unsafeHttp: true };
    };
    if (!raw) {
        return devKey !== undefined && devKey.length > 0
            ? { devApiKey: devKey }
            : {};
    }
    return {
        ...fromUrl(raw),
        ...(devKey !== undefined && devKey.length > 0
            ? { devApiKey: devKey }
            : {}),
    };
}

/** Same in-memory path as the browser e2e — no native sqlite binding. */
async function makeStorage(SK) {
    setCryptoProfile("tweetnacl");
    const sign = xSignKeyPairFromSecret(XUtils.decodeHex(SK));
    const id = XKeyConvert.convertKeyPair(sign);
    if (!id) {
        throw new Error("x25519 id");
    }
    const atRest = XUtils.deriveLocalAtRestAesKey(id.secretKey, "tweetnacl");
    const storage = new MemoryStorage(atRest);
    await storage.init();
    return storage;
}

function connectAndWait(c, label, timeout = 10_000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${label} connect timed out`));
        }, timeout);
        const onConnected = () => {
            clearTimeout(timer);
            c.off("connected", onConnected);
            resolve();
        };
        c.on("connected", onConnected);
        c.connect().catch((err) => {
            clearTimeout(timer);
            reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
}

/**
 * Inbox is keyed by *recipient* device. Path must be that device ID; the JWT
 * for this client must match the same device (Spire `protect` middleware).
 *
 * @param {import("../dist/index.js").Client} client
 * @returns {Promise<number>}
 */
async function mailInboxLen(client) {
    const id = client.me.device().deviceID;
    // `http` is private on Client; runtime field is always present.
    const res = await client["http"].post(
        client.getHost() + "/device/" + id + "/mail",
    );
    const buf = new Uint8Array(res.data);
    const inbox = msgpack.decode(buf);
    return Array.isArray(inbox) ? inbox.length : -1;
}

if (!process.env.API_URL) {
    process.env.API_URL = "http://127.0.0.1:16777";
}
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = "test";
}
if (!process.env.DEV_API_KEY?.trim()) {
    console.warn(
        "[probe] DEV_API_KEY unset — you may get 429s. Set to match Spire.\n",
    );
}

const opts = { inMemoryDb: true, ...apiUrlOverrideFromEnv() };
const password = "probe-pw-1";
const senderPw = "probe-sender-pw";
const username = Client.randomUsername();
const senderName = Client.randomUsername();

const SK = Client.generateSecretKey();
const d1 = await Client.create(SK, opts, await makeStorage(SK));

const SK2 = Client.generateSecretKey();
const d2 = await Client.create(SK2, opts, await makeStorage(SK2));

const SK3 = Client.generateSecretKey();
const sender = await Client.create(SK3, opts, await makeStorage(SK3));

try {
    await d1.register(username, password);
    if (!(await d1.login(username, password)).ok) {
        throw new Error("d1 login failed");
    }
    await connectAndWait(d1, "d1");
    const w1 = await d1.whoami();
    console.log(
        "device1 (primary)",
        d1.me.device().deviceID,
        "user",
        w1.user?.username,
    );

    await d2.login(username, password);
    await connectAndWait(d2, "d2");
    const w2 = await d2.whoami();
    console.log(
        "device2 (2nd dev)",
        d2.me.device().deviceID,
        "user",
        w2.user?.username,
    );

    await new Promise((r) => setTimeout(r, 300));

    await sender.register(senderName, senderPw);
    if (!(await sender.login(senderName, senderPw)).ok) {
        throw new Error("sender login failed");
    }
    await connectAndWait(sender, "sender");

    const targetUserID = d1.me.user().userID;
    const before1 = await mailInboxLen(d1);
    const before2 = await mailInboxLen(d2);
    console.log("POST /mail inbox length: before send — d1=", before1, "d2=", before2);

    await sender.messages.send(targetUserID, "sync-test");
    console.log("sent sync-test to user", targetUserID);

    for (let i = 0; i <= 15; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const a = await mailInboxLen(d1);
        const b = await mailInboxLen(d2);
        const t = 1 + i;
        console.log(
            `POST /mail t+${String(t).padStart(2, "0")}s: d1=${a}  d2=${b}`,
        );
        if (a > 0 && b > 0) {
            console.log("[probe] both inboxes have mail on the server.");
            process.exit(0);
        }
    }
    const final1 = await mailInboxLen(d1);
    const final2 = await mailInboxLen(d2);
    if (final1 > 0 || final2 > 0) {
        console.log(
            "[probe] partial: one or both devices have mail. d1=",
            final1,
            "d2=",
            final2,
        );
        process.exit(final1 > 0 && final2 > 0 ? 0 : 1);
    }
    console.log("[probe] no mail rows on either device after 16s of polling /mail");
    process.exit(2);
} catch (e) {
    console.error(e);
    process.exit(1);
} finally {
    try {
        await d2.close();
    } catch {}
    try {
        await sender.close();
    } catch {}
    try {
        await d1.close();
    } catch {}
}
