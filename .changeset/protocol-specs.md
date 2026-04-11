---
"@vex-chat/libvex": major
---

First post-dormancy major release, aligned with `@vex-chat/types@2.0.0`, `@vex-chat/crypto@2.0.0`, and `@vex-chat/spire@1.0.0`. Consumers should treat this as a rewrite and re-integrate end-to-end rather than an in-place upgrade — the wire protocol, type shapes, transport layer, and authentication flow have all changed.

### Stack

- **Pure ESM** (`type: "module"`). Previously CommonJS.
- **Node `>=24.0.0`, npm `>=10.0.0`** engines. Previously unspecified.
- **npm** enforced as the only package manager (`preinstall: npx only-allow npm`).
- **TypeScript 6.0.2** with the full strict flag set (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, `isolatedModules`). Zero `any`, zero `eslint-disable`, zero non-null assertions.
- **Multiple subpath exports** under one package: `.`, `./preset/node`, `./preset/test`, `./storage/node`, `./storage/sqlite`, `./storage/schema`, `./keystore/node`, `./keystore/memory`. Browser bundles never pull in `better-sqlite3` or other native modules.

### Wire protocol / types

- **Re-exported types now come from `@vex-chat/types@2.0.0`.** Consumers that imported `Invite` (or any other re-exported type from libvex) get the new shape: `I` prefix dropped (`IInvite` → `Invite`), date fields now ISO 8601 strings on the wire instead of `Date` objects.
- **`ISucessMsg` typo fixed** to `SuccessMsg` upstream — propagates through.
- **All wire reads parsed through Zod schemas** at trust boundaries via `createCodec()` — invalid server responses now reject at the codec instead of crashing further down the call stack.
- **`KeyStore` and `StoredCredentials`** moved here from `@vex-chat/types` (those types are platform-storage concerns, not wire types).

### Cryptographic primitives

- **`@vex-chat/crypto@2.0.0`** is now the only crypto dep. Previously libvex pulled `tweetnacl` directly; that and several other transitive deps are gone — see "Removed dependencies" below.

### Authentication & transport

- **Per-client axios with Bearer auth.** Previously libvex relied on shared cookies via the global `axios` default. Now each `Client` instance gets its own `AxiosInstance` and authenticates via `Authorization: Bearer <token>`. Consumers no longer need to share cookie state between clients in the same process. (ADR-008)
- **Post-connection WebSocket auth.** The WS handshake now negotiates auth after the socket opens, with an event-loop yield in between, fixing a race that broke auth on slow connections. (ADR-006)
- **`Client.loginWithDeviceKey()`** — passwordless auto-login using a previously-registered device key. Skips the `register` + `login` round-trip on subsequent app launches. (ADR-007)
- **`Client.deleteAllData()`** — public method that purges message history, encryption sessions, and prekeys, then closes the client. Credentials (keychain entries) must still be cleared by the embedding app.

### Storage & key management

- **`PreKeysCrypto.index`** is now required (was nullable). The `UnsavedPreKey` type covers the brief pre-DB state. Eliminates a class of "index missing" runtime checks downstream.
- **Tauri-compatible prekey index retrieval** — falls back from `RETURNING` clauses to a `SELECT … WHERE publicKey = ?` query for SQLite drivers that don't expose `insertId`.
- **`SqliteStorage` write-after-close errors** are now suppressed instead of crashing the process when a client is closed mid-write.
- **Negative cache for user lookups** — failed `getUser` calls cache the 404 for 30 minutes instead of retrying in a tight loop.

### Codec / wire framing

- **`createCodec()` factory** for type-safe msgpack encode/decode, paired with a Zod schema for runtime validation on the decode path.
- **`send()` accepts only `Uint8Array`.** Previously the WebSocket adapter accepted strings too — that path was only used by the old cookie-auth handshake which is now gone.

### Browser safety

- **Static "no-Buffer / no-node-builtin" check in vitest browser projects.** A vitest plugin scans the bundled output for `\bBuffer\b` / `\bprocess\b` / unprefixed node builtins and fails the browser project on any match. Caught a real Buffer reference in `codecs.ts` during this work.
- **`browser-or-node` dependency removed** — replaced with feature detection at the call sites that needed it.
- **`navigator.userAgent` guard** — undefined on React Native, was crashing client init on RN.

### Removed dependencies

These are no longer in libvex's `dependencies` (some moved to peer, some replaced, some unused):

- `tweetnacl` — replaced by `@vex-chat/crypto`
- `ws` — replaced by the runtime-native WebSocket (browser, node 24+, RN)
- `sleep` / `sleep-promise` — replaced by inline `await new Promise(r => setTimeout(r, ms))`
- `picocolors` — unused
- `object-hash` — unused
- `browser-or-node` — replaced by feature detection

### Removed presets

- **`./preset/tauri` and `./preset/expo` are gone.** Platform-specific code (Tauri's `@tauri-apps/plugin-sql`, Expo's `expo-sqlite`) lives in the consuming app now, not in libvex. Apps targeting these platforms should:
    1. Import `Client` from `@vex-chat/libvex` directly
    2. Implement `Storage` (the schema is exported from `@vex-chat/libvex/storage/schema`)
    3. Implement `KeyStore`
    4. Pass both into `Client.create(secretKey, options, storage, keystore)`

    See the README and the in-repo `./preset/node` / `./preset/test` implementations for reference.

### Testing infrastructure

- **Vitest projects** — `npm test` runs the unit suite (browser-safe, offline), `npm run test:e2e` runs the node + browser e2e suites against a real spire.
- **Property-based round-trip tests** for the msgpack codec via `fast-check`.
- **Shared test harness** — node, browser, and (formerly Tauri/Expo) suites all run through one shared describe block, parameterized by storage and keystore.

### Build / tooling / CI

- **`@arethetypeswrong/cli`, `publint`, `@microsoft/api-extractor`** all run on every PR, with the api-extractor report committed at `api/libvex.api.md` so reviewers see public API surface drift in PR diffs.
- **Changesets release flow** — `changeset` files in `.changeset/`, automatic release PRs from `release.yml` on master, npm publish with `--provenance` and SBOM upload.
- **Auto-changeset workflow** — Claude reads `AGENTS.md`, the recent CHANGELOG entries, the PR's commits, and a byte-diff between the PR's freshly-built `dist/` and the published tarball, then writes (or skips writing) a changeset.
- **Parallel CI jobs** gated by a `CI OK` aggregator: `build`, `test`, `lint`, `types`, `library-quality`, `supply-chain`, `changeset`, `e2e-prod`. Build/test run on ubuntu/macos/windows because `better-sqlite3` and the kysely migration provider have caught real Windows-only failures.
- **Supply-chain hardening** — every action pinned by SHA, `step-security/harden-runner` on every job, `persist-credentials: false` on every checkout, weekly CodeQL + Scorecard scans, npm `--ignore-scripts` everywhere except where `better-sqlite3` legitimately needs build scripts.
- **License allowlist gate**, type coverage ≥95%.
