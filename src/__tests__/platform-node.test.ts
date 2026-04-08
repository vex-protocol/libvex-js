import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { platformSuite } from "./harness/shared-suite.js";
import { nodeTestAdapters } from "./harness/platform-transports.js";
import { createNodeStorage } from "../storage/node.js";
import { Client } from "../index.js";
import type { IClientOptions, IMessage } from "../index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

platformSuite("node", nodeTestAdapters, (SK: string, _opts: IClientOptions) =>
    createNodeStorage(":memory:", SK),
);

// Node-only tests that require fs/Buffer (file operations, emoji, avatar)
describe("node: file operations", () => {
    let client: Client;
    let serverID: string;
    const username = Client.randomUsername();

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

    beforeAll(async () => {
        const SK = Client.generateSecretKey();
        const opts: IClientOptions = {
            inMemoryDb: true,
            logLevel: "error",
            dbLogLevel: "error",
            adapters: nodeTestAdapters(),
            ...apiUrlOverrideFromEnv(),
        };
        const storage = createNodeStorage(":memory:", SK);
        client = await Client.create(SK, opts, storage);
        await client.register(username, "test-pw");
        await client.login(username, "test-pw");
        await new Promise<void>((resolve) => {
            client.on("connected", resolve);
            client.connect();
        });
        const server = await client.servers.create("File Test Server");
        serverID = server.serverID;
    });

    afterAll(async () => {
        await client?.close().catch(() => {});
    });

    test("file upload + download", async () => {
        const original = new Uint8Array(1000).fill(42);
        const [details, key] = await client.files.create(original);
        const fetched = await client.files.retrieve(details.fileID, key);
        expect(fetched).toBeTruthy();
        expect(new Uint8Array(fetched!.data)).toEqual(original);
    });

    test("emoji upload", async () => {
        const buf = new Uint8Array(
            fs.readFileSync(path.join(__dirname, "triggered.png")),
        );
        const emoji = await client.emoji.create(buf, "triggered", serverID);
        expect(emoji).toBeTruthy();
        const list = await client.emoji.retrieveList(serverID);
        expect(list.some((e) => e.emojiID === emoji!.emojiID)).toBe(true);
    });

    test("avatar upload", async () => {
        const buf = new Uint8Array(
            fs.readFileSync(path.join(__dirname, "ghost.png")),
        );
        await client.me.setAvatar(buf);
    });
});
