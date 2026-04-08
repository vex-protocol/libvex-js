import { sleep } from "@extrahash/sleep";
// tslint:disable-next-line: no-implicit-dependencies
import fs from "fs";
import _ from "lodash";
import { Client } from "../index.js";
import type {
    IChannel,
    IClientOptions,
    IMessage,
    IServer,
    IUser,
} from "../index.js";

let clientA: Client | null = null;

/**
 * Tests use production api.vex.wtf by default (Client default when host is omitted).
 * Override with API_URL, e.g. API_URL=http://localhost:16777 or API_URL=localhost:16777
 */
function isProbablyLocalHost(host: string): boolean {
    const h = host.toLowerCase();
    return (
        h.startsWith("localhost:") ||
        h === "localhost" ||
        h.startsWith("127.0.0.1") ||
        h.startsWith("[::1]") ||
        h.startsWith("::1")
    );
}

function apiUrlOverrideFromEnv():
    | Pick<IClientOptions, "host" | "unsafeHttp">
    | undefined {
    const raw = process.env.API_URL?.trim();
    if (!raw) {
        return undefined;
    }
    if (/^https?:\/\//i.test(raw)) {
        const u = new URL(raw);
        return {
            host: u.host,
            unsafeHttp: u.protocol === "http:",
        };
    }
    const host = raw.replace(/^\/+/, "");
    return {
        host,
        unsafeHttp: isProbablyLocalHost(host),
    };
}

const clientOptions: IClientOptions = {
    inMemoryDb: true,
    logLevel: "error",
    dbLogLevel: "error",
    ...apiUrlOverrideFromEnv(),
};

beforeAll(async () => {
    const SK = Client.generateSecretKey();

    clientA = await Client.create(SK, clientOptions);
    if (!clientA) {
        throw new Error("Couldn't create client.");
    }
});

describe("Perform client tests", () => {
    let createdServer: IServer | null = null;
    let createdChannel: IChannel | null = null;

    const username = Client.randomUsername();
    const password = "hunter2";

    let userDetails: IUser | null = null;
    test("Register", async () => {
        const [user, err] = await clientA!.register(username, password);
        if (err) {
            throw err;
        }
        userDetails = user;
        expect(user!.username === username).toBe(true);
    });

    test("Login", () => {
        return login(clientA!, username, password);
    });

    test("Connect", async () => {
        await new Promise<void>(async (resolve) => {
            clientA!.on("connected", () => {
                resolve();
            });
            await clientA!.connect();
        });
    });

    test("Server operations", async () => {
        const permissions = await clientA!.permissions.retrieve();
        expect(permissions).toEqual([]);

        const server = await clientA!.servers.create("Test Server");
        const serverList = await clientA!.servers.retrieve();
        const [knownServer] = serverList;
        expect(server.serverID).toBe(knownServer.serverID);

        const retrieveByIDServer = await clientA!.servers.retrieveByID(
            server.serverID,
        );
        expect(server.serverID).toEqual(retrieveByIDServer?.serverID);

        await clientA!.servers.delete(server.serverID);

        // make another server to be used by channel tests
        createdServer = await clientA!.servers.create("Channel Test Server");
    });

    test("Channel operations", async () => {
        const servers = await clientA!.servers.retrieve();
        const [testServer] = servers;

        const channel = await clientA!.channels.create(
            "Test Channel",
            testServer.serverID,
        );

        await clientA!.channels.delete(channel.channelID);

        const channels = await clientA!.channels.retrieve(testServer.serverID);
        expect(channels.length).toBe(1);

        createdChannel = channels[0];

        const retrievedByIDChannel = await clientA!.channels.retrieveByID(
            channels[0].channelID,
        );
        expect(channels[0].channelID === retrievedByIDChannel?.channelID).toBe(
            true,
        );
    });

    test("Direct messaging", async () => {
        await new Promise<void>(async (resolve) => {
            const received: string[] = [];

            const receivedAllExpected = () =>
                received.includes("initial") && received.includes("subsequent");

            const onMessage = (message: IMessage) => {
                if (!message.decrypted) {
                    throw new Error("Message failed to decrypt.");
                }
                if (
                    message.direction === "incoming" &&
                    message.decrypted &&
                    message.group === null
                ) {
                    received.push(message.message);
                    if (receivedAllExpected()) {
                        clientA!.off("message", onMessage);
                        resolve();
                    }
                }
            };
            clientA!.on("message", onMessage);

            const me = clientA!.me.user();

            await clientA!.messages.send(me.userID, "initial");
            await sleep(500);
            await clientA!.messages.send(me.userID, "subsequent");
        });
    });

    test("File operations", async () => {
        const createdFile = Buffer.alloc(1000);
        createdFile.fill(0);

        const [createdDetails, key] = await clientA!.files.create(createdFile);
        const fetchedFileRes = await clientA!.files.retrieve(
            createdDetails.fileID,
            key,
        );
        if (!fetchedFileRes) {
            throw new Error("Error fetching file.");
        }

        const { data, details } = fetchedFileRes;

        expect(_.isEqual(createdFile, data)).toBe(true);
        expect(_.isEqual(createdDetails.nonce, details.nonce)).toBe(true);
    });

    test("Upload an emoji", async () => {
        const buf = fs.readFileSync("./src/__tests__/triggered.png");
        const emoji = await clientA!.emoji.create(
            buf,
            "triggered",
            createdServer!.serverID,
        );
        if (!emoji) {
            throw new Error("Couldn't create emoji.");
        }
        const list = await clientA?.emoji.retrieveList(createdServer!.serverID);
        expect([emoji]).toEqual(list);
    });

    test("Upload an avatar", async () => {
        const buf = fs.readFileSync("./src/__tests__/ghost.png");
        await clientA!.me.setAvatar(buf);
    });

    test("Create invite", async () => {
        if (!createdServer) {
            throw new Error("Server not created, can't do invite test.");
        }

        const invite = await clientA!.invites.create(
            createdServer.serverID,
            "1h",
        );
        await clientA?.invites.redeem(invite.inviteID);

        const serverInviteList = await clientA?.invites.retrieve(
            createdServer.serverID,
        );
    });

    test("Group messaging", async () => {
        await new Promise<void>(async (resolve) => {
            const received: string[] = [];

            const receivedAllExpected = () =>
                received.includes("initial") && received.includes("subsequent");

            const onGroupMessage = (message: IMessage) => {
                if (!message.decrypted) {
                    throw new Error("Message failed to decrypt.");
                }
                if (
                    message.direction === "incoming" &&
                    message.decrypted &&
                    message.group !== null
                ) {
                    received.push(message.message);
                    if (receivedAllExpected()) {
                        clientA!.off("message", onGroupMessage);
                        resolve();
                    }
                }
            };

            clientA!.on("message", onGroupMessage);

            await clientA!.messages.group(createdChannel!.channelID, "initial");
            await sleep(500);
            await clientA!.messages.group(
                createdChannel!.channelID,
                "subsequent",
            );
        });
    });

    test("Message history operations", async () => {
        const history = await clientA?.messages.retrieve(
            clientA.me.user().userID,
        );
        if (!history) {
            throw new Error("No history found!");
        }

        await clientA?.messages.delete(clientA.me.user().userID);

        const postHistory = await clientA?.messages.retrieve(
            clientA.me.user().userID,
        );
        expect(postHistory?.length).toBe(0);
    });
});

/**
 * @hidden
 */
const login = async (client: Client, username: string, password: string) => {
    const err = await client.login(username, password);
    if (err) {
        console.error(JSON.stringify(err));
        await client.close();
        throw new Error(err.toString());
    }
};
