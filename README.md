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

[Documentation](https://vex-chat.github.io/libvex-js/)

## What's in the box

- **End-to-end encrypted messaging** with X3DH key agreement and a Double Ratchet message stack — sessions, prekeys, and one-time keys handled internally.
- **Tree-shakable subpath exports** for platform-specific code: `./preset/node`, `./preset/test`, `./storage/node`, `./storage/sqlite`, `./storage/schema`, `./keystore/node`, `./keystore/memory`. Browser bundles never pull in `better-sqlite3` or other native modules.
- **Pluggable storage backend** via Kysely so node consumers can use SQLite and browser/tauri/expo consumers can wire their own.
- **Pluggable key store** so secrets can live in memory (tests), the OS keychain (`./keystore/node`), or wherever the embedding app keeps them.
- **WebSocket transport** for live message delivery with automatic reconnection and HTTP fallback for the REST API.
- **Strict runtime validation** on every wire boundary — every server response is parsed through a Zod schema before any logic touches it.

## Install

```sh
npm install @vex-chat/libvex
```

`@vex-chat/types`, `@vex-chat/crypto`, `axios`, `kysely`, `winston`, and `zod` are required runtime dependencies and install automatically.

`better-sqlite3` is an **optional peer dependency** — install it explicitly only if you plan to use the SQLite storage backend on Node:

```sh
npm install @vex-chat/libvex better-sqlite3
```

Browser, Tauri, and Expo consumers should leave `better-sqlite3` out and supply their own storage adapter via `./storage/schema`.

## Quickstart

```ts
import { Client } from "@vex-chat/libvex";

// Generate or load a long-lived secret key — store it in the OS keychain.
const secretKey = Client.generateSecretKey();

const client = await Client.create(secretKey);

// First-time devices must register before logging in.
await client.register(Client.randomUsername());
await client.login();

client.on("authed", async () => {
    const me = await client.users.me();
    await client.messages.send(me.userID, "Hello world!");
});

client.on("message", (message) => {
    console.log("message:", message);
});
```

## Platform presets

libvex ships per-platform "presets" that wire together the appropriate storage and keystore:

```ts
// Node — sqlite storage + OS keychain
import {
    Client,
    makeStorage,
    BootstrapConfig,
} from "@vex-chat/libvex/preset/node";

// Tests / ephemeral — in-memory storage + memory keystore
import {
    Client,
    makeStorage,
    BootstrapConfig,
} from "@vex-chat/libvex/preset/test";
```

For a custom platform (browser, tauri, expo), import `Client` from `@vex-chat/libvex` directly and supply your own `Storage` (implementing the schema in `@vex-chat/libvex/storage/schema`) and `KeyStore` to `Client.create`.

## Development

```sh
npm run build           # tsc -p tsconfig.build.json
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

The unit suite (`npm test`) runs browser-safe and offline. The e2e suite (`npm run test:e2e`) spins up a real spire server in a separate process — point `VEX_API_URL` at a running spire if you want to test against a different host.

See [AGENTS.md](./AGENTS.md) for the release flow (changesets → publish) and the rules for writing changesets.

## License

[AGPL-3.0-or-later](./LICENSE)
