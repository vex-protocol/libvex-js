/**
 * Shared integration test body. Called by each platform entry file
 * with a different adapter factory.
 *
 * Runs register → login → connect → send/receive DM against a real spire.
 */

import { Client } from "../../index.js";
import type { IClientOptions, IMessage } from "../../index.js";
import type { IStorage } from "../../IStorage.js";
import type { IClientAdapters } from "../../transport/types.js";

function apiUrlOverrideFromEnv():
    | Pick<IClientOptions, "host" | "unsafeHttp">
    | undefined {
    const raw = process.env.API_URL?.trim();
    if (!raw) return undefined;
    if (/^https?:\/\//i.test(raw)) {
        const u = new URL(raw);
        return { host: u.host, unsafeHttp: u.protocol === "http:" };
    }
    return { host: raw, unsafeHttp: true };
}

export function platformSuite(
    platformName: string,
    makeAdapters: () => IClientAdapters,
    makeStorage: (SK: string, opts: IClientOptions) => IStorage,
) {
    describe(`platform: ${platformName}`, () => {
        let client: Client;
        const username = Client.randomUsername();
        const password = "platform-test-pw";

        beforeAll(async () => {
            const SK = Client.generateSecretKey();
            const opts: IClientOptions = {
                inMemoryDb: true,
                logLevel: "error",
                dbLogLevel: "error",
                adapters: makeAdapters(),
                ...apiUrlOverrideFromEnv(),
            };
            const storage = makeStorage(SK, opts);
            client = await Client.create(SK, opts, storage);
        });

        afterAll(async () => {
            try {
                await client?.close();
            } catch {}
        });

        test("register", async () => {
            const [user, err] = await client.register(username, password);
            expect(err).toBeNull();
            expect(user!.username).toBe(username);
        });

        test("login", async () => {
            const err = await client.login(username, password);
            expect(err).toBeFalsy();
        });

        test("connect (websocket auth)", async () => {
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(
                    () =>
                        reject(
                            new Error(
                                `[${platformName}] connect timed out — WS auth probably failed`,
                            ),
                        ),
                    10_000,
                );
                client.on("connected", () => {
                    clearTimeout(timer);
                    resolve();
                });
                client.connect().catch((err) => {
                    clearTimeout(timer);
                    reject(err);
                });
            });
        });

        test("send and receive DM", async () => {
            const me = client.me.user();
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(
                    () => reject(new Error(`[${platformName}] DM timed out`)),
                    10_000,
                );
                const onMsg = (msg: IMessage) => {
                    if (msg.direction === "incoming" && msg.decrypted) {
                        clearTimeout(timer);
                        client.off("message", onMsg);
                        expect(msg.message).toBe("platform-test");
                        resolve();
                    }
                };
                client.on("message", onMsg);
                client.messages.send(me.userID, "platform-test");
            });
        });
    });
}
