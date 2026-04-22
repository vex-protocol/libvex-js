/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

/**
 * Shared integration test body. Called by each platform entry file
 * with a different adapter factory.
 *
 * Runs register → login → connect → send/receive DM against a real spire.
 *
 * **Vitest e2e only** — the published `Client` does not read the environment;
 * app code passes `ClientOptions` (`host`, `devApiKey`, `cryptoProfile`, …).
 * These `process.env` values are for running **this** repo’s platform tests
 * (shell, CI, or your own env injection — not a “libvex .env” contract).
 * - `API_URL` — Spire base, e.g. `http://127.0.0.1:16777` or `host:port` (http assumed).
 *   When set, `beforeAll` reads `GET …/status` `cryptoProfile` and **sets the
 *   test process to match** (so a FIPS Spire does not require a separate client flag).
 *   A post-check then fails if the client and server still disagree.
 * - `DEV_API_KEY` — must match the Spire `DEV_API_KEY` so the client can send
 *   `x-dev-api-key` and avoid dev rate limits.
 * - `LIBVEX_E2E_SKIP_STATUS_CHECK=1` — opt out of the /status profile read + check
 *   (e.g. older Spire). Then `LIBVEX_E2E_CRYPTO` or default tweetnacl is used.
 * - `LIBVEX_E2E_CRYPTO` — optional override: `fips` | `tweetnacl` (wins over auto
 *   detect from /status; use to force a profile when you know what you need).
 */

import type { ClientOptions, Message } from "../../index.js";
import type { Storage } from "../../Storage.js";

import { getCryptoProfile, setCryptoProfile } from "@vex-chat/crypto";

import { isAxiosError } from "axios";

import { Client } from "../../index.js";

import { testFile, testImage } from "./fixtures.js";

/**
 * `GET` `{API_URL or http://}{host}/status` — used for crypto profile preflight
 * (must match `getCryptoProfile()` when running e2e against a custom Spire).
 */
function spireStatusUrlFromEnv(): null | string {
    const raw = process.env["API_URL"]?.trim();
    if (raw === undefined || raw.length === 0) {
        return null;
    }
    if (/^https?:\/\//i.test(raw)) {
        const u = new URL(raw);
        return `${u.protocol}//${u.host}/status`;
    }
    return `http://${raw}/status`;
}

/** `LIBVEX_E2E_CRYPTO` only — used when status auto-detect is skipped. */
function e2eCryptoProfileFromEnvOnly(): "fips" | "tweetnacl" {
    const v = process.env["LIBVEX_E2E_CRYPTO"]?.trim().toLowerCase();
    if (v === "fips" || v === "p-256" || v === "p256") {
        return "fips";
    }
    if (v === "tweetnacl" || v === "nacl" || v === "ed25519") {
        return "tweetnacl";
    }
    return "tweetnacl";
}

/**
 * Picks the signing profile for the suite: optional env override, else `GET` Spire
 * `/status` when `API_URL` is set, else tweetnacl.
 */
async function resolveE2eCryptoProfile(): Promise<"fips" | "tweetnacl"> {
    if (process.env["LIBVEX_E2E_SKIP_STATUS_CHECK"] === "1") {
        return e2eCryptoProfileFromEnvOnly();
    }
    const v = process.env["LIBVEX_E2E_CRYPTO"]?.trim().toLowerCase();
    if (v === "fips" || v === "p-256" || v === "p256") {
        return "fips";
    }
    if (v === "tweetnacl" || v === "nacl" || v === "ed25519") {
        return "tweetnacl";
    }
    if (v !== undefined && v.length > 0) {
        throw new Error(
            `libvex e2e: invalid LIBVEX_E2E_CRYPTO=${JSON.stringify(v)}. Use fips, tweetnacl, or leave unset to auto-detect from Spire /status`,
        );
    }
    const url = spireStatusUrlFromEnv();
    if (url === null) {
        return "tweetnacl";
    }
    let res: Response;
    try {
        res = await fetch(url, { method: "GET" });
    } catch {
        return "tweetnacl";
    }
    if (!res.ok) {
        return "tweetnacl";
    }
    const data: unknown = await res.json();
    if (
        typeof data !== "object" ||
        data === null ||
        !("cryptoProfile" in data)
    ) {
        return "tweetnacl";
    }
    const cp = (data as { cryptoProfile: unknown }).cryptoProfile;
    if (cp === "fips" || cp === "tweetnacl") {
        return cp;
    }
    return "tweetnacl";
}

function e2eClientOptionsBase(): ClientOptions {
    return {
        inMemoryDb: true,
        ...apiUrlOverrideFromEnv(),
        cryptoProfile: getCryptoProfile(),
    };
}

async function e2eGenerateSecretKey(): Promise<string> {
    return await Client.generateSecretKeyAsync();
}

async function assertSpireCryptoProfileMatchesTest(): Promise<void> {
    if (process.env["LIBVEX_E2E_SKIP_STATUS_CHECK"] === "1") {
        return;
    }
    const url = spireStatusUrlFromEnv();
    if (url === null) {
        return;
    }
    const want = getCryptoProfile();
    let res: Response;
    try {
        res = await fetch(url, { method: "GET" });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(
            `libvex e2e: could not GET ${url} (check API_URL; is Spire running?): ${msg}`,
        );
    }
    if (!res.ok) {
        throw new Error(
            `libvex e2e: ${url} returned HTTP ${String(res.status)} — Spire not reachable on this base URL?`,
        );
    }
    const data: unknown = await res.json();
    if (
        typeof data !== "object" ||
        data === null ||
        !("cryptoProfile" in data) ||
        typeof (data as { cryptoProfile: unknown }).cryptoProfile !== "string"
    ) {
        throw new Error(
            `libvex e2e: Spire /status is missing a string "cryptoProfile" (upgrade Spire) or set LIBVEX_E2E_SKIP_STATUS_CHECK=1 to skip this check`,
        );
    }
    const gotStr = (data as { cryptoProfile: string }).cryptoProfile;
    if (gotStr !== "fips" && gotStr !== "tweetnacl") {
        throw new Error(
            `libvex e2e: Spire /status cryptoProfile is not fips|tweetnacl: ${gotStr}`,
        );
    }
    if (gotStr !== want) {
        throw new Error(
            `libvex e2e: Spire is cryptoProfile=${gotStr} (see SPIRE_FIPS + SPK) but this test has getCryptoProfile()=${want}. Use matching keys/scripts (gen-spk.js vs gen-spk-fips.js) and the same mode on client and server.`,
        );
    }
}

export function platformSuite(
    platformName: string,
    makeStorage: (SK: string, opts: ClientOptions) => Promise<Storage>,
) {
    describe.sequential(`platform: ${platformName}`, () => {
        let client: Client;
        const username = Client.randomUsername();
        const password = "platform-test-pw";

        beforeAll(async () => {
            const profile = await resolveE2eCryptoProfile();
            setCryptoProfile(profile);
            const SK = await e2eGenerateSecretKey();

            const opts: ClientOptions = e2eClientOptionsBase();
            const storage = await makeStorage(SK, opts);
            client = await Client.create(SK, opts, storage);
            await assertSpireCryptoProfileMatchesTest();
        });

        afterAll(async () => {
            try {
                await client.close();
            } catch {}
        });

        test("register", async () => {
            const [user, err] = await client.register(username, password);
            expect(err).toBeNull();
            expect(user!.username).toBe(username);
        });

        test("login", async () => {
            const result = await client.login(username, password);
            expect(result.ok).toBe(true);
        });

        test("connect (websocket auth)", async () => {
            await connectAndWait(client, `[${platformName}] WS auth`);
            expect(true).toBe(true);
        });

        test("send and receive DM (self)", async () => {
            const me = client.me.user();
            const msgPromise = waitForMessage(
                client,
                (m) => m.direction === "incoming" && m.decrypted,
                `[${platformName}] self-DM`,
            );
            void client.messages.send(me.userID, "platform-test");
            const msg = await msgPromise;
            expect(msg.message).toBe("platform-test");
        });

        test("two-user DM", async () => {
            const SK2 = await e2eGenerateSecretKey();
            const opts2: ClientOptions = e2eClientOptionsBase();
            const storage2 = await makeStorage(SK2, opts2);
            const client2 = await Client.create(SK2, opts2, storage2);
            const username2 = Client.randomUsername();

            try {
                const [user2, regErr] = await client2.register(
                    username2,
                    "test-pw-2",
                );
                expect(regErr).toBeNull();

                const loginErr = await client2.login(username2, "test-pw-2");
                expect(loginErr.ok).toBe(true);

                await connectAndWait(client2, "client2");

                // client sends to client2, client2 receives
                const msgPromise = waitForMessage(
                    client2,
                    (m) => m.direction === "incoming" && m.decrypted,
                    `[${platformName}] two-user DM`,
                    15_000,
                );
                void client.messages.send(user2!.userID, "hello from user 1");
                const msg = await msgPromise;
                expect(msg.message).toBe("hello from user 1");
            } finally {
                await client2.close().catch(() => {});
            }
        });

        test("group messaging in channel", async () => {
            const SK2 = await e2eGenerateSecretKey();
            const opts2: ClientOptions = e2eClientOptionsBase();
            const storage2 = await makeStorage(SK2, opts2);
            const client2 = await Client.create(SK2, opts2, storage2);
            const username2 = Client.randomUsername();
            let serverIdForCleanup: string | undefined;

            try {
                // Register + login + connect user2
                await client2.register(username2, "test-pw-2");
                await client2.login(username2, "test-pw-2");
                await connectAndWait(client2, "client2");

                // user1 creates server + channel
                const server = await withTransientRetry(() =>
                    client.servers.create("test-server"),
                );
                expect(server).toBeTruthy();
                serverIdForCleanup = server.serverID;
                const channels = await client.channels.retrieve(
                    server.serverID,
                );
                expect(channels.length).toBeGreaterThan(0);
                const channel = channels[0];
                if (!channel) throw new Error("No channel found");

                // user1 creates invite, user2 redeems it
                const invite = await withTransientRetry(() =>
                    client.invites.create(server.serverID, "1h"),
                );
                expect(invite).toBeTruthy();
                await withTransientRetry(() =>
                    client2.invites.redeem(invite.inviteID),
                );

                // user1 sends group message, user2 receives it
                const msgPromise = waitForMessage(
                    client2,
                    (m) =>
                        m.direction === "incoming" &&
                        m.decrypted &&
                        m.group === channel.channelID,
                    "group message receive",
                    15_000,
                );
                await withTransientRetry(() =>
                    client.messages.group(channel.channelID, "hello channel"),
                );
                const msg = await msgPromise;
                expect(msg.message).toBe("hello channel");

                // Cleanup
                await client.servers.delete(server.serverID);
                serverIdForCleanup = undefined;
            } finally {
                if (serverIdForCleanup) {
                    await client.servers
                        .delete(serverIdForCleanup)
                        .catch(() => {});
                }
                await client2.close().catch(() => {});
            }
        });

        test("loginWithDeviceKey (auto-login)", async () => {
            // Simulate app restart: create a new Client with the same
            // device key, authenticate without password.
            const deviceKey = client.getKeys().private;
            const deviceID = client.me.device().deviceID;
            const opts2: ClientOptions = e2eClientOptionsBase();
            const storage2 = await makeStorage(deviceKey, opts2);
            const client2 = await Client.create(deviceKey, opts2, storage2);

            try {
                const authErr = await client2.loginWithDeviceKey(deviceID);
                expect(authErr).toBeNull();

                await connectAndWait(client2, "device-key");

                // Same user, same identity
                expect(client2.me.user().userID).toBe(client.me.user().userID);
                expect(client2.me.user().username).toBe(username);
            } finally {
                await client2.close().catch(() => {});
            }
        });

        test("server CRUD", async () => {
            // Do not assert permissions start empty: earlier tests in this sequential
            // suite (or a partially cleaned server from a flaky run) may leave rows.

            const server = await client.servers.create("Test Server");
            const serverList = await client.servers.retrieve();
            expect(serverList.some((s) => s.serverID === server.serverID)).toBe(
                true,
            );

            const byID = await client.servers.retrieveByID(server.serverID);
            expect(byID?.serverID).toBe(server.serverID);

            await client.servers.delete(server.serverID);
            const afterDelete = await client.servers.retrieve();
            expect(
                afterDelete.some((s) => s.serverID === server.serverID),
            ).toBe(false);
        });

        test("channel CRUD", async () => {
            const server = await client.servers.create("Channel Test Server");
            const channel = await client.channels.create(
                "Test Channel",
                server.serverID,
            );

            const byID = await client.channels.retrieveByID(channel.channelID);
            expect(byID?.channelID).toBe(channel.channelID);

            await client.channels.delete(channel.channelID);
            const channels = await client.channels.retrieve(server.serverID);
            expect(
                channels.some((c) => c.channelID === channel.channelID),
            ).toBe(false);
            // Default channel still exists
            expect(channels.length).toBe(1);

            await client.servers.delete(server.serverID);
        });

        test("invite create + redeem", async () => {
            let serverIdForCleanup: string | undefined;
            try {
                const server = await withTransientRetry(() =>
                    client.servers.create("Invite Test Server"),
                );
                serverIdForCleanup = server.serverID;
                const invite = await withTransientRetry(() =>
                    client.invites.create(server.serverID, "1h"),
                );
                expect(invite).toBeTruthy();
                expect(invite.serverID).toBe(server.serverID);

                await withTransientRetry(() =>
                    client.invites.redeem(invite.inviteID),
                );
                await client.servers.delete(server.serverID);
                serverIdForCleanup = undefined;
            } finally {
                if (serverIdForCleanup) {
                    await client.servers
                        .delete(serverIdForCleanup)
                        .catch(() => {});
                }
            }
        });

        test("message history retrieve + delete", async () => {
            const me = client.me.user();

            // Send a message and wait for it
            const msgPromise = waitForMessage(
                client,
                (m) => m.direction === "incoming" && m.decrypted,
                "history DM",
            );
            void client.messages.send(me.userID, "history-test");
            await msgPromise;

            const history = await client.messages.retrieve(me.userID);
            expect(history.length).toBeGreaterThan(0);

            await client.messages.delete(me.userID);
            const afterDelete = await client.messages.retrieve(me.userID);
            expect(afterDelete.length).toBe(0);
        });

        test("multi-device message sync", async () => {
            const SK2 = await e2eGenerateSecretKey();
            const opts2: ClientOptions = e2eClientOptionsBase();
            const storage2 = await makeStorage(SK2, opts2);
            const device2 = await Client.create(SK2, opts2, storage2);

            // Sender: separate user
            const SK3 = await e2eGenerateSecretKey();
            const opts3: ClientOptions = e2eClientOptionsBase();
            const storage3 = await makeStorage(SK3, opts3);
            const sender = await Client.create(SK3, opts3, storage3);
            const senderName = Client.randomUsername();

            try {
                // Register device2 under same account
                await device2.login(username, password);
                await connectAndWait(device2, "device2");
                // Let Spire + OTK registration finish so peer device list is complete.
                await new Promise((r) => setTimeout(r, 300));

                // Register + connect sender
                await sender.register(senderName, "sender-pw");
                await sender.login(senderName, "sender-pw");
                await connectAndWait(sender, "sender");

                const targetUserID = client.me.user().userID;

                const isSync = (m: Message) =>
                    m.direction === "incoming" &&
                    m.decrypted &&
                    m.message === "sync-test";

                // Timers start when listeners attach; they must still cover
                // two full X3DH+WS round-trips on the sender, then delivery.
                const messageWaitMs = 90_000;
                const pClient = waitForMessage(
                    client,
                    isSync,
                    "multi-device: primary client (device1)",
                    messageWaitMs,
                );
                const pSecond = waitForMessage(
                    device2,
                    isSync,
                    "multi-device: second client (device2)",
                    messageWaitMs,
                );

                await sender.messages.send(targetUserID, "sync-test");
                const [msgPrimary, msgDevice2] = await Promise.all([
                    pClient,
                    pSecond,
                ]);
                expect(msgPrimary.message).toBe("sync-test");
                expect(msgDevice2.message).toBe("sync-test");
            } finally {
                await device2.close().catch(() => {});
                await sender.close().catch(() => {});
            }
        }, 120_000);

        test("file upload + download", async () => {
            const [details, key] = await client.files.create(testFile);
            expect(details.fileID).toBeTruthy();

            const fetched = await client.files.retrieve(details.fileID, key);
            expect(fetched).toBeTruthy();
            expect(new Uint8Array(fetched!.data)).toEqual(testFile);
        });

        test("emoji upload", async () => {
            const server = await client.servers.create("Emoji Test Server");
            const emoji = await client.emoji.create(
                testImage,
                "testmoji",
                server.serverID,
            );
            expect(emoji).toBeTruthy();

            const list = await client.emoji.retrieveList(server.serverID);
            expect(list.some((e) => e.emojiID === emoji!.emojiID)).toBe(true);

            await client.servers.delete(server.serverID);
        });

        test("avatar upload", async () => {
            await client.me.setAvatar(testImage);
            expect(true).toBe(true);
        });
    });
}

function apiUrlOverrideFromEnv():
    | Pick<ClientOptions, "host" | "unsafeHttp" | "devApiKey">
    | undefined {
    const raw = process.env["API_URL"]?.trim();
    const devKey = process.env["DEV_API_KEY"]?.trim();
    if (!raw && (devKey === undefined || devKey.length === 0)) {
        return undefined;
    }
    const fromUrl = (s: string): Pick<ClientOptions, "host" | "unsafeHttp"> => {
        if (/^https?:\/\//i.test(s)) {
            const u = new URL(s);
            return { host: u.host, unsafeHttp: u.protocol === "http:" };
        }
        return { host: s, unsafeHttp: true };
    };
    if (!raw) {
        return devKey !== undefined && devKey.length > 0
            ? { devApiKey: devKey }
            : undefined;
    }
    return {
        ...fromUrl(raw),
        ...(devKey !== undefined && devKey.length > 0
            ? { devApiKey: devKey }
            : {}),
    };
}

/** Shared staging / CI proxies sometimes return 502; retry a few times. */
async function withTransientRetry<T>(fn: () => Promise<T>): Promise<T> {
    const attempts = 4;
    let last: unknown;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (e) {
            last = e;
            const transient =
                isAxiosError(e) &&
                (e.response?.status === 502 || e.response?.status === 503);
            if (transient && i < attempts - 1) {
                await new Promise((r) => setTimeout(r, 400 * (i + 1)));
                continue;
            }
            throw e;
        }
    }
    throw last;
}

function connectAndWait(
    c: Client,
    label: string,
    timeout = 10_000,
): Promise<void> {
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
        c.connect().catch((err: unknown) => {
            clearTimeout(timer);
            reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
}

async function waitForMessage(
    c: Client,
    predicate: (m: Message) => boolean,
    label: string,
    timeout = 10_000,
): Promise<Message> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${label} message timed out`));
        }, timeout);
        const onMsg = (msg: Message) => {
            if (predicate(msg)) {
                clearTimeout(timer);
                c.off("message", onMsg);
                resolve(msg);
            }
        };
        c.on("message", onMsg);
    });
}
