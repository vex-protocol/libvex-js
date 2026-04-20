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
 */

import type { ClientOptions, Message } from "../../index.js";
import type { Storage } from "../../Storage.js";

import { isAxiosError } from "axios";

import { Client } from "../../index.js";

import { testFile, testImage } from "./fixtures.js";

export function platformSuite(
    platformName: string,
    makeStorage: (SK: string, opts: ClientOptions) => Promise<Storage>,
) {
    describe.sequential(`platform: ${platformName}`, () => {
        let client: Client;
        const username = Client.randomUsername();
        const password = "platform-test-pw";

        beforeAll(async () => {
            const SK = Client.generateSecretKey();

            const opts: ClientOptions = {
                inMemoryDb: true,
                ...apiUrlOverrideFromEnv(),
            };
            const storage = await makeStorage(SK, opts);
            client = await Client.create(SK, opts, storage);
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
            const SK2 = Client.generateSecretKey();
            const opts2: ClientOptions = {
                inMemoryDb: true,
                ...apiUrlOverrideFromEnv(),
            };
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
            const SK2 = Client.generateSecretKey();
            const opts2: ClientOptions = {
                inMemoryDb: true,
                ...apiUrlOverrideFromEnv(),
            };
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
            const opts2: ClientOptions = {
                inMemoryDb: true,
                ...apiUrlOverrideFromEnv(),
            };
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

        // TODO: multi-device fan-out requires sender to query fresh device
        // list before sending. Currently the sender caches one device and
        // the message only reaches device1.
        test.todo("multi-device message sync", async () => {
            const SK2 = Client.generateSecretKey();
            const opts2: ClientOptions = {
                inMemoryDb: true,
                ...apiUrlOverrideFromEnv(),
            };
            const storage2 = await makeStorage(SK2, opts2);
            const device2 = await Client.create(SK2, opts2, storage2);

            // Sender: separate user
            const SK3 = Client.generateSecretKey();
            const opts3: ClientOptions = {
                inMemoryDb: true,
                ...apiUrlOverrideFromEnv(),
            };
            const storage3 = await makeStorage(SK3, opts3);
            const sender = await Client.create(SK3, opts3, storage3);
            const senderName = Client.randomUsername();

            try {
                // Register device2 under same account
                await device2.login(username, password);
                await connectAndWait(device2, "device2");

                // Register + connect sender
                await sender.register(senderName, "sender-pw");
                await sender.login(senderName, "sender-pw");
                await connectAndWait(sender, "sender");

                const targetUserID = client.me.user().userID;

                // Both devices listen for the incoming DM
                const received = { device1: false, device2: false };

                const waitForBoth = new Promise<void>((resolve, reject) => {
                    const timer = setTimeout(() => {
                        reject(
                            new Error(
                                `multi-device sync timed out (d1=${String(received.device1)}, d2=${String(received.device2)})`,
                            ),
                        );
                    }, 15_000);
                    const check = () => {
                        if (received.device1 && received.device2) {
                            clearTimeout(timer);
                            resolve();
                        }
                    };

                    client.on("message", (msg: Message) => {
                        if (
                            msg.direction === "incoming" &&
                            msg.decrypted &&
                            msg.message === "sync-test"
                        ) {
                            received.device1 = true;
                            check();
                        }
                    });
                    device2.on("message", (msg: Message) => {
                        if (
                            msg.direction === "incoming" &&
                            msg.decrypted &&
                            msg.message === "sync-test"
                        ) {
                            received.device2 = true;
                            check();
                        }
                    });
                });

                void sender.messages.send(targetUserID, "sync-test");
                await waitForBoth;

                expect(received.device1).toBe(true);
                expect(received.device2).toBe(true);
            } finally {
                await device2.close().catch(() => {});
                await sender.close().catch(() => {});
            }
        });

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
    | Pick<ClientOptions, "host" | "unsafeHttp">
    | undefined {
    const raw = process.env["API_URL"]?.trim();
    if (!raw) return undefined;
    if (/^https?:\/\//i.test(raw)) {
        const u = new URL(raw);
        return { host: u.host, unsafeHttp: u.protocol === "http:" };
    }
    return { host: raw, unsafeHttp: true };
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
