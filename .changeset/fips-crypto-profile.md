---
"@vex-chat/libvex": minor
---

`ClientOptions` now accepts an optional `cryptoProfile` field (`"tweetnacl"` or `"fips"`); when set to `"fips"`, the client uses P-256 + Web Crypto primitives instead of Ed25519/X25519 (tweetnacl). Pass `cryptoProfile: "fips"` consistently across all peers and the server — the two profiles do not interoperate. Three new async helpers are also exposed: `Client.generateSecretKeyAsync()` (required in fips mode), `Client.encryptKeyDataAsync()`, and `Client.decryptKeyDataAsync()`.
