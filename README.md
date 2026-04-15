# @vex-chat/libvex

[![npm](https://img.shields.io/npm/v/@vex-chat/libvex?style=flat-square&color=cb3837&logo=npm)](https://www.npmjs.com/package/@vex-chat/libvex)
[![CI](https://img.shields.io/github/actions/workflow/status/vex-protocol/libvex-js/build.yml?branch=master&style=flat-square&logo=github&label=CI)](https://github.com/vex-protocol/libvex-js/actions/workflows/build.yml)
[![Released](https://img.shields.io/github/release-date/vex-protocol/libvex-js?style=flat-square&label=released)](https://github.com/vex-protocol/libvex-js/releases)
[![License](https://img.shields.io/npm/l/@vex-chat/libvex?style=flat-square&color=blue)](./LICENSE)
[![Types](https://img.shields.io/npm/types/@vex-chat/libvex?style=flat-square&logo=typescript&color=3178c6)](./dist/index.d.ts)
[![Type Coverage](https://img.shields.io/badge/dynamic/json?style=flat-square&label=type-coverage&prefix=%E2%89%A5&suffix=%25&query=$.typeCoverage.atLeast&url=https://raw.githubusercontent.com/vex-protocol/libvex-js/master/package.json&color=3178c6&logo=typescript)](https://github.com/plantain-00/type-coverage)
[![Node](https://img.shields.io/node/v/@vex-chat/libvex?style=flat-square&color=339933&logo=nodedotjs)](./package.json)
[![Bundle](https://deno.bundlejs.com/badge?q=@vex-chat/libvex&treeshake=[*])](https://bundlejs.com/?q=@vex-chat/libvex&treeshake=[*])
[![OpenSSF Scorecard](https://img.shields.io/ossf-scorecard/github.com/vex-protocol/libvex-js?style=flat-square&label=Scorecard)](https://securityscorecards.dev/viewer/?uri=github.com/vex-protocol/libvex-js)
[![Socket](https://socket.dev/api/badge/npm/package/@vex-chat/libvex)](https://socket.dev/npm/package/@vex-chat/libvex)

Reference TypeScript client for the [Vex](https://vex.wtf) encrypted chat platform. Builds against the wire protocol defined in [@vex-chat/types](https://github.com/vex-protocol/types-js) and the cryptographic primitives in [@vex-chat/crypto](https://github.com/vex-protocol/crypto-js). Use it to build a chat client, a bot, or any application that needs to talk to a [spire](https://github.com/vex-protocol/spire) server.

[Documentation](https://vex-protocol.github.io/libvex-js/)

## What's in the box

The client implements an X3DH-style handshake (X25519 DH + KDF), XSalsa20-Poly1305 (xSecretbox) for payloads, and HMAC over mail objects for integrity on the wire. Message payloads are intended to be end-to-end encrypted; the server still sees ciphertext, routing metadata, timing, and who talks to whom, and controls key-bundle distribution—so a malicious or compromised Spire can mount impersonation unless users verify sessions out-of-band.

- **End-to-end encrypted messaging** with X3DH key agreement — sessions, prekeys, and one-time keys handled internally.
- **Tree-shakable subpath exports** for platform-specific code: `./preset/node`, `./preset/test`, `./storage/node`, `./storage/sqlite`, `./storage/schema`, `./keystore/node`, `./keystore/memory`. Browser bundles never pull in `better-sqlite3` or other native modules.
- **Pluggable storage backend** via Kysely so node consumers can use SQLite and browser/tauri/expo consumers can wire their own.
- **Pluggable key store** so secrets can live in memory (tests), passphrase-encrypted files on disk (`./keystore/node`), or wherever the embedding app keeps them.
- **WebSocket transport** for live message delivery with automatic reconnection and HTTP fallback for the REST API.

## Install

```sh
npm install @vex-chat/libvex
```

`@vex-chat/types`, `@vex-chat/crypto`, `axios`, `eventemitter3`, `kysely`, `msgpackr`, `uuid`, and `zod` are required runtime dependencies and install automatically.

`better-sqlite3` is an **optional peer dependency** — install it explicitly only if you plan to use the SQLite storage backend on Node:

```sh
npm install @vex-chat/libvex better-sqlite3
```

Browser, Tauri, and Expo consumers should leave `better-sqlite3` out and supply their own storage adapter via `./storage/schema`.

## Quickstart

```ts
import { Client } from "@vex-chat/libvex";

// Generate or load a long-lived secret key.
const secretKey = Client.generateSecretKey();

const client = await Client.create(secretKey);

// First-time devices must register before logging in.
await client.register("myUsername", "myPassword");
await client.login("myUsername", "myPassword");

// connect() authenticates the WebSocket and fires "ready" when done.
await client.connect();

client.on("ready", async () => {
    const me = client.me.user();
    await client.messages.send(me.userID, "Hello world!");
});

client.on("message", (message) => {
    console.log("message:", message);
});
```

## Platform presets

libvex ships per-platform "presets" that wire together the appropriate storage and keystore:

```ts
// Node — sqlite storage + encrypted file keystore
import { nodePreset } from "@vex-chat/libvex/preset/node";

// Tests / ephemeral — in-memory storage, no persistence
import { testPreset } from "@vex-chat/libvex/preset/test";
```

Presets return a `PlatformPreset` with a `createStorage()` factory and a `deviceName`. For a custom platform (browser, tauri, expo), import `Client` from `@vex-chat/libvex` directly and supply your own `Storage` (implementing the schema in `@vex-chat/libvex/storage/schema`) and `KeyStore` to `Client.create`.

## Development

```sh
npm run build           # rimraf dist && tsc -p tsconfig.build.json
npm run lint            # eslint
npm run lint:fix        # eslint --fix
npm run format          # prettier --write
npm run format:check
npm test                # vitest unit suite (browser-safe, no spire required)
npm run test:e2e        # vitest node + browser e2e — needs a running spire
npm run lint:pkg        # publint --strict
npm run lint:types      # @arethetypeswrong/cli
npm run lint:api        # api-extractor — regenerates api/libvex.api.md
npx type-coverage       # type-coverage (≥95%)
npm run license:check   # license allowlist gate
npm run docs            # typedoc — writes ./docs
```

The unit suite (`npm test`) runs browser-safe and offline. The e2e suite (`npm run test:e2e`) requires a running spire server — set `VEX_API_URL` to point at it (defaults to `localhost`).

See [AGENTS.md](./AGENTS.md) for the release flow (changesets → publish) and the rules for writing changesets.

## License

[AGPL-3.0-or-later](./LICENSE)
