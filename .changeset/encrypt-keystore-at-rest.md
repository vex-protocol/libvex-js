---
"@vex-chat/libvex": major
---

`NodeKeyStore` now requires a `passphrase` string as its first constructor argument; credentials are encrypted at rest using this passphrase. Pass the same passphrase on every instantiation to read previously saved credentials. Additionally, `ClientOptions.logger`, `ClientOptions.logLevel`, and `ClientOptions.dbLogLevel` have been removed — the client no longer exposes a configurable logger interface.
