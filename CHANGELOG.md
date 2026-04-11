# @vex-chat/libvex

## 1.1.0

Auth and transport overhaul, plus a vitest workspace that finally runs the node and browser suites in one command. Three ADRs landed in this release:

### ADR-006: post-connection WebSocket auth

The WS handshake used to negotiate auth before the socket was fully open, which raced against the connection upgrade on slow links and silently dropped auth messages. The new flow opens the socket first, yields the event loop, then sends the auth frame on the established connection.

### ADR-007: passwordless device login

New `Client.loginWithDeviceKey()` method. After a one-time `register` + `login` round-trip, the device's persistent key is enough to re-authenticate without a password on subsequent app launches. Apps that need biometric or PIN gating can wrap this however they like — libvex just needs the device key.

### ADR-008: per-client axios with Bearer auth

Previously every `Client` instance shared the global `axios` default and authenticated via cookies. That meant:

- Multiple `Client` instances in one process collided on auth state.
- Cookie handling needed simulation in test transports.
- Browser cookie policies (SameSite, third-party blocking) were a constant source of friction.

Now each `Client` gets its own `AxiosInstance` and authenticates via `Authorization: Bearer <token>` on every REST call. Cookies are gone from the libvex codebase entirely. Test transports lost their cookie-simulation layer as a side benefit.

### Other features

- **`deviceName` on `PlatformPreset`** — labels for the device that show up in the UI's device list. Cross-platform: Node uses `os.hostname()`, browsers use a sanitized `navigator.userAgent`, React Native passes its own.
- **Vitest workspace** — `npm test` runs the node + browser projects together via a single `vitest run` invocation. Previously each project had its own command and CI ran them in series.
- **Multi-device test coverage** — new e2e tests for two-user DM (full X3DH key exchange), group messaging across users, channel/server/invite CRUD, file/emoji/avatar upload, and `loginWithDeviceKey` round-tripping.

### Fixes

- **`navigator.userAgent` is undefined on React Native** — the previous client init crashed on RN because it tried to read `userAgent` unconditionally. Now guarded.
- **`SqliteStorage` write-after-close errors** are caught and logged instead of bubbling out of an async event handler and crashing the process.
- **Device challenge response decode** — the server frames the challenge response as msgpack, libvex was decoding it as JSON. Wire mismatch silently failed `loginWithDeviceKey` until this fix.
- **`loginWithDeviceKey` accepts an explicit `deviceID`** parameter for callers that want to log in as a specific device rather than "the most recently used one."

### Refactors

- **Test helpers extracted** to a shared module — listener leak fixes, `describe.sequential` for ordered suites, common setup/teardown.
- **Three platform tests collapsed into two** (node + browser); the obsolete Tauri suite is gone — that work moved to ADR-009 in this branch's successor.
- **Test transports simplified** — cookie simulation removed (ADR-008 made it unnecessary), file/emoji/avatar tests moved into the shared suite so they cover both projects.

## 1.0.2

Initial post-dormancy patch line — see the git history for `121c826..1.0.0` for the per-commit detail. The 1.0.x series re-cut the published package off the modern tree (TypeScript 6, ESM, Node 24+) but still depended on the pre-2.0 wire types and pre-2.0 crypto primitives. 1.1.0 above is the first release where the new auth flow lands; 2.0.0 (next) is the first release on the post-Zod wire protocol.
