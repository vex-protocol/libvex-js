# libvex-js

![build](https://github.com/vex-chat/libvex-js/workflows/build/badge.svg)

Library for interfacing with vex chat server. Use it for a client, a bot, whatever you'd like to connect to vex. Supports Node.js, Tauri, Expo, and browsers.

<a href="https://vex-chat.github.io/libvex-js/">Documentation</a>

## Quickstart

```ts
import { Client } from "@vex-chat/libvex";

async function main() {
    // generate a secret key to use, save this somewhere permanent
    const privateKey = Client.generateSecretKey();

    const client = await Client.create(privateKey);

    // you must register once before you can log in
    await client.register(Client.randomUsername());
    await client.login();

    // The authed event fires when login() successfully completes
    // and the server indicates you are authorized. You must wait to
    // perform any operations besides register() and login() until
    // this occurs.
    client.on("authed", async () => {
        const me = await client.users.me();

        // send a message
        await client.messages.send(me.userID, "Hello world!");
    });

    // Outgoing and incoming messages are emitted here.
    client.on("message", (message) => {
        console.log("message:", message);
    });
}

main();
```
